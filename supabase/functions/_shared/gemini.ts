// Gemini API クライアント
//
// Google AI Studio の Gemini REST API を fetch で叩く軽量ラッパ。
// fetch は Deno (Edge Function ランタイム) と Node 18+ (vitest) の両方でグローバル提供。
//
// 認証は API key（ヘッダ x-goog-api-key）。OAuth 等は使わない。

import type {
  GeminiCallMeta,
  GeminiCallResult,
  GeminiModel,
} from "./types";
import { calculateCostUsd } from "./budget";

// =====================================================================
// Gemini API レスポンス型（必要部分のみ）
// =====================================================================

interface GeminiContentPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64
  };
}

interface GeminiContent {
  role?: "user" | "model";
  parts: GeminiContentPart[];
}

interface GeminiCandidate {
  content: GeminiContent;
  finishReason?: string;
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

interface GeminiGenerateResponse {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  promptFeedback?: { blockReason?: string };
}

// =====================================================================
// 入力型
// =====================================================================

export interface GeminiTextInput {
  /** システムプロンプト（ペルソナ、出力フォーマット指示等） */
  system?: string;
  /** ユーザープロンプト */
  user: string;
  /** 画像（base64）と MIME。OCR で利用 */
  image?: { mimeType: string; data: string };
  /** 出力に JSON Schema 制約をかけるか（true で `responseMimeType=application/json`） */
  jsonOutput?: boolean;
}

export interface GeminiClientOptions {
  /** GEMINI_API_KEY */
  apiKey: string;
  /** 使用するモデル名 */
  model: GeminiModel;
  /** API ベース URL。テスト時に差し替え可能 */
  baseUrl?: string;
  /** fetch を差し替え可能にしてテストしやすくする */
  fetchImpl?: typeof fetch;
  /** タイムアウト ms（デフォルト 60000） */
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// =====================================================================
// 本体
// =====================================================================

/** Gemini にテキスト+任意の画像を送り、生成テキストを返す。
 *  失敗時は throw する。呼び出し側で try-catch して fallback / ai_advice_logs 記録 */
export async function callGemini(
  input: GeminiTextInput,
  opts: GeminiClientOptions,
): Promise<GeminiCallResult<string>> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/models/${opts.model}:generateContent`;

  const parts: GeminiContentPart[] = [{ text: input.user }];
  if (input.image) {
    parts.push({
      inlineData: {
        mimeType: input.image.mimeType,
        data: input.image.data,
      },
    });
  }

  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
  };
  if (input.system) {
    body.systemInstruction = { parts: [{ text: input.system }] };
  }
  if (input.jsonOutput) {
    body.generationConfig = { responseMimeType: "application/json" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);

  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": opts.apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await safeReadText(res);
    throw new Error(
      `Gemini API error: status=${res.status} body=${truncate(errText, 500)}`,
    );
  }

  const json = (await res.json()) as GeminiGenerateResponse;

  if (json.promptFeedback?.blockReason) {
    throw new Error(
      `Gemini blocked the prompt: ${json.promptFeedback.blockReason}`,
    );
  }

  const text = extractText(json);
  if (!text) {
    throw new Error("Gemini returned no text");
  }

  const tokens_in = json.usageMetadata?.promptTokenCount ?? 0;
  const tokens_out = json.usageMetadata?.candidatesTokenCount ?? 0;
  const meta: GeminiCallMeta = {
    model: opts.model,
    tokens_in,
    tokens_out,
    cost_usd: calculateCostUsd(opts.model, tokens_in, tokens_out),
  };

  return { data: text, meta };
}

// =====================================================================
// helpers
// =====================================================================

export function extractText(resp: GeminiGenerateResponse): string {
  const cand = resp.candidates?.[0];
  if (!cand) return "";
  return (cand.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<read error>";
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Gemini が JSON 文字列を返してくる前提でパースする。失敗時は throw */
export function parseJsonOutput<T>(text: string): T {
  // モデルによってはマークダウンコードブロックで包んでくることがある
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  return JSON.parse(cleaned) as T;
}
