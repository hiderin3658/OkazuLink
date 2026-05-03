// extract-receipt: レシート画像から食材リスト・店舗・合計金額等を AI 抽出する。
//
// フロー:
//   1. 認証 + ホワイトリスト確認
//   2. リクエスト body から imagePath を取得（"<userId>/<uuid>.jpg" 形式）
//   3. パスが認証ユーザーのものか検証（防御）
//   4. Supabase Storage `receipts` バケットから画像をダウンロード
//   5. 画像を base64 化して Gemini に渡す（OCR プロンプト）
//   6. 月次予算チェック（hard モードで超過時は呼出を拒否）
//   7. Gemini 3 Flash で実行 → 失敗時 Pro へ自動フォールバック
//   8. 出力 JSON を validateOcrResult で検証・整形
//   9. ai_advice_logs に成功/失敗を記録
//  10. 整形済みの OcrResult を返す
//
// ローカル動作確認:
//   supabase functions serve extract-receipt --env-file ./supabase/functions/.env

import { authenticate, createServiceClient } from "../_shared/auth.ts";
import { jsonResponse, preflightResponse } from "../_shared/cors.ts";
import { getEnv, mustEnv } from "../_shared/env.ts";
import {
  callGemini,
  GeminiError,
  parseJsonOutput,
} from "../_shared/gemini.ts";
import { buildReceiptOcrPrompt } from "../_shared/prompts.ts";
import { logAiCall, getMonthlyCostUsd } from "../_shared/ai-log.ts";
import { evaluateBudget, usdToJpy } from "../_shared/budget.ts";
import type {
  AiKind,
  BudgetMode,
  EdgeError,
  EdgeErrorCode,
  OcrResult,
} from "../_shared/types.ts";
import { OcrValidationError, validateOcrResult } from "./validate.ts";

interface RequestBody {
  /** Storage 内パス: "<userId>/<uuid>.<ext>" */
  imagePath?: string;
  /** 補助ヒント（店舗名や日付を補足する場合） */
  hint?: string;
}

const RECEIPTS_BUCKET = "receipts";

// =====================================================================
// Helpers
// =====================================================================

function badRequest(message: string, detail?: string): Response {
  const err: EdgeError = { error: message, code: "BAD_REQUEST", detail };
  return jsonResponse(err, { status: 400 });
}

function internalError(message: string, detail?: string): Response {
  const err: EdgeError = { error: message, code: "INTERNAL_ERROR", detail };
  return jsonResponse(err, { status: 500 });
}

/** Storage download した Blob を Gemini inlineData に渡せる base64 文字列に変換 */
async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // 一括 String.fromCharCode はスタックオーバーフロー懸念があるため chunked
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(i, Math.min(i + chunk, bytes.length)),
    );
  }
  return btoa(binary);
}

/** Storage アップロード時の MIME を信頼。未設定なら拡張子から推測（最後の手段） */
function guessMimeType(blob: Blob, path: string): string {
  if (blob.type) return blob.type;
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  return "image/jpeg";
}

/** OCR 失敗の原因を EdgeError.code に変換する。
 *  reason ごとに分けることで、クライアント側で UX 分岐できる
 *  （例: timeout はリトライ、blocked は別の画像を促す、等） */
function ocrFailureCode(err: unknown): EdgeErrorCode {
  if (err instanceof GeminiError) {
    if (err.reason === "timeout") return "AI_TIMEOUT";
    if (err.reason === "blocked") return "AI_BLOCKED";
    return "AI_INVALID_RESPONSE";
  }
  if (err instanceof OcrValidationError) {
    return "AI_INVALID_RESPONSE";
  }
  return "INTERNAL_ERROR";
}

// =====================================================================
// Main handler
// =====================================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflightResponse();
  if (req.method !== "POST") {
    return jsonResponse<EdgeError>(
      { error: "Method not allowed", code: "BAD_REQUEST" },
      { status: 405 },
    );
  }

  // 1. 認証
  const auth = await authenticate(req);
  if (!auth.ok) return jsonResponse(auth.error, { status: auth.status });

  // 2. リクエスト body
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return badRequest("Invalid JSON body");
  }
  const imagePath = body.imagePath?.trim();
  if (!imagePath) return badRequest("imagePath is required");

  // 3. パストラバーサル / 他人のファイル参照を防御
  //    Storage RLS でも防げるが、Edge Function 側で先に弾いて UX 改善
  const normalized = imagePath.replace(/^\/+/, "");
  if (normalized.includes("..") || normalized.includes("//")) {
    return badRequest("Invalid imagePath");
  }
  // バケット名前置きはここでは受け付けない（受け取るのは "<userId>/<uuid>.<ext>" のみ）
  const segments = normalized.split("/");
  if (segments.length < 2) {
    return badRequest("imagePath must be `<userId>/<filename>`");
  }
  if (segments[0] !== auth.userId) {
    return badRequest("imagePath does not belong to the current user");
  }

  // 4. Storage から画像取得
  const { data: blob, error: dlErr } = await auth.supabase.storage
    .from(RECEIPTS_BUCKET)
    .download(normalized);
  if (dlErr || !blob) {
    return badRequest("Failed to fetch image", dlErr?.message);
  }

  const mimeType = guessMimeType(blob, normalized);
  const base64 = await blobToBase64(blob);

  // 5. 月次予算チェック（hard モードのみ実呼出をブロック）
  const serviceClient = createServiceClient();
  const monthlyUsd = await getMonthlyCostUsd(serviceClient);
  const usdJpyRate = Number(getEnv("USD_JPY_RATE") ?? "150");
  const monthlyJpy = usdToJpy(monthlyUsd, usdJpyRate);
  const budgetJpy = Number(getEnv("MONTHLY_AI_BUDGET_JPY") ?? "1000");
  const budgetMode = (getEnv("AI_BUDGET_MODE") ?? "soft") as BudgetMode;
  const budgetStatus = evaluateBudget(monthlyJpy, budgetJpy, budgetMode);
  if (!budgetStatus.allow) {
    const err: EdgeError = {
      error: "Monthly AI budget exceeded",
      code: "BUDGET_EXCEEDED",
      detail: `${budgetStatus.monthly_total_jpy} JPY / ${budgetStatus.budget_jpy} JPY (mode=hard)`,
    };
    return jsonResponse(err, { status: 429 });
  }
  if (budgetStatus.exceeded) {
    console.warn(
      `[extract-receipt] budget exceeded but mode=soft, continuing. ${budgetStatus.monthly_total_jpy}/${budgetStatus.budget_jpy} JPY`,
    );
  }

  // 6. Gemini 呼び出し（primary → fallback）
  const apiKey = mustEnv("GEMINI_API_KEY");
  const primaryModel = getEnv("MODEL_OCR") ?? "gemini-2.5-flash";
  // Pro モデルは課金登録が必要。free tier 環境では MODEL_OCR_FALLBACK=gemini-2.5-flash を設定する。
  const fallbackModel = getEnv("MODEL_OCR_FALLBACK") ?? "gemini-2.5-pro";

  const prompt = buildReceiptOcrPrompt({ hint: body.hint });

  const attempts: { model: string; kind: AiKind }[] = [
    { model: primaryModel, kind: "ocr" },
  ];
  if (fallbackModel && fallbackModel !== primaryModel) {
    attempts.push({ model: fallbackModel, kind: "ocr_fallback" });
  }

  let result: OcrResult | null = null;
  let lastError: Error | null = null;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i]!;
    const isLast = i === attempts.length - 1;
    try {
      const response = await callGemini(
        {
          system: prompt.system,
          user: prompt.user,
          image: { mimeType, data: base64 },
          jsonOutput: true,
        },
        { apiKey, model: attempt.model },
      );

      const parsed = parseJsonOutput<unknown>(response.data);
      const validated = validateOcrResult(parsed);

      // 成功記録
      await logAiCall(serviceClient, {
        user_id: auth.userId,
        kind: attempt.kind,
        model: attempt.model,
        request_payload: { imagePath: normalized, mimeType, hint: body.hint },
        response: validated,
        meta: response.meta,
      });

      result = validated;
      break;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const detail = lastError.message;
      // GeminiError なら reason ごとに warn / error 分け
      const reason = err instanceof GeminiError ? err.reason : "unknown";
      console.warn(
        `[extract-receipt] attempt ${i + 1}/${attempts.length} failed (model=${attempt.model}, reason=${reason}): ${detail}`,
      );

      // 失敗記録
      await logAiCall(serviceClient, {
        user_id: auth.userId,
        kind: attempt.kind,
        model: attempt.model,
        request_payload: { imagePath: normalized, mimeType, hint: body.hint },
        error: detail,
      });

      if (isLast) {
        const code = ocrFailureCode(err);
        const status = code === "AI_TIMEOUT" ? 504 : code === "AI_BLOCKED" ? 422 : 502;
        return jsonResponse<EdgeError>(
          {
            error: "OCR failed",
            code,
            detail: `last_reason=${reason}; ${detail}`,
          },
          { status },
        );
      }
      // 次の attempt へ
    }
  }

  if (!result) {
    return internalError(
      "OCR did not produce a result",
      lastError?.message,
    );
  }

  return jsonResponse(result);
});
