// advise-nutrition: 月次栄養データから AI コーチコメント + 推奨食材を生成する。
//
// フロー:
//   1. 認証 + ホワイトリスト確認
//   2. 入力 monthStart (YYYY-MM-01) の検証
//   3. nutrition_monthly_summaries から月次サマリーを取得
//   4. user_profiles からプロフィール取得（目標 / アレルギー / 苦手）
//   5. 達成率を計算（recommended_per_day × 月日数 で比較）
//   6. キャッシュキー作成 → SHA-256 ハッシュ
//   7. ai_advice_logs に kind=nutrition で同じハッシュを持つ既存ログを検索
//      - ヒット: cached=true で返却
//   8. ミス: 月次予算チェック → Gemini 3 Pro 呼出 → validate
//   9. 結果を ai_advice_logs に記録（input_hash を request_payload に含める）
//  10. cached=false で返却

import { authenticate, createServiceClient } from "../_shared/auth.ts";
import { jsonResponse, preflightResponse } from "../_shared/cors.ts";
import { getEnv, mustEnv } from "../_shared/env.ts";
import {
  callGemini,
  GeminiError,
  parseJsonOutput,
} from "../_shared/gemini.ts";
import {
  buildAdviceCacheKey,
  buildNutritionAdvicePrompt,
} from "../_shared/prompts.ts";
import { sha256Hex } from "../_shared/hash.ts";
import { logAiCall, getMonthlyCostUsd } from "../_shared/ai-log.ts";
import { evaluateBudget, usdToJpy } from "../_shared/budget.ts";
import type {
  BudgetMode,
  EdgeError,
  EdgeErrorCode,
  NutritionAdvice,
} from "../_shared/types.ts";
import { AdviceValidationError, validateNutritionAdvice } from "./validate.ts";

interface RequestBody {
  monthStart?: string; // YYYY-MM-01
}

interface SuccessResponse {
  cached: boolean;
  advice: NutritionAdvice;
  monthLabel: string;
  ageGroup: string;
  monthDays: number;
}

const MONTH_START_RE = /^(\d{4})-(\d{2})-01$/;

// =====================================================================
// helpers
// =====================================================================

function badRequest(message: string, detail?: string): Response {
  const err: EdgeError = { error: message, code: "BAD_REQUEST", detail };
  return jsonResponse(err, { status: 400 });
}

function aiFailureCode(err: unknown): EdgeErrorCode {
  if (err instanceof GeminiError) {
    if (err.reason === "timeout") return "AI_TIMEOUT";
    if (err.reason === "blocked") return "AI_BLOCKED";
    return "AI_INVALID_RESPONSE";
  }
  if (err instanceof AdviceValidationError) return "AI_INVALID_RESPONSE";
  return "INTERNAL_ERROR";
}

function parseMonthStart(input: string | undefined): string | null {
  if (!input) return null;
  const m = MONTH_START_RE.exec(input);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return input;
}

function monthLabel(monthStart: string): string {
  const [y, m] = monthStart.split("-").map(Number);
  return `${y}年${m}月`;
}

function daysInMonth(monthStart: string): number {
  const [y, m] = monthStart.split("-").map(Number);
  if (!y || !m) return 30;
  const cur = Date.UTC(y, m - 1, 1);
  const next = m === 12 ? Date.UTC(y + 1, 0, 1) : Date.UTC(y, m, 1);
  return Math.round((next - cur) / (24 * 3600 * 1000));
}

// 厚労省 2020 年版 女性・身体活動レベル II 推奨摂取量（1 日量）。
// app 側 (lib/nutrition/recommended.ts) と整合させる必要があるため、
// Phase 2 内では値の同期に注意。将来は API で配信する形に統一可能。
const FEMALE_DAILY: Record<string, Record<string, number | null>> = {
  "18-29": {
    energy_kcal: 2000, protein_g: 50, fat_g: 60, carb_g: 290, fiber_g: 18,
    salt_g: 6.5, calcium_mg: 650, iron_mg: 10.5, vitamin_a_ug: 650,
    vitamin_c_mg: 100, vitamin_d_ug: 8.5, vitamin_b1_mg: 1.1, vitamin_b2_mg: 1.2,
    vitamin_b6_mg: 1.1, vitamin_b12_ug: 2.4, folate_ug: 240, potassium_mg: 2000,
    magnesium_mg: 270, phosphorus_mg: 800, zinc_mg: 8,
  },
  "30-49": {
    energy_kcal: 2050, protein_g: 50, fat_g: 63, carb_g: 295, fiber_g: 18,
    salt_g: 6.5, calcium_mg: 650, iron_mg: 10.5, vitamin_a_ug: 700,
    vitamin_c_mg: 100, vitamin_d_ug: 8.5, vitamin_b1_mg: 1.1, vitamin_b2_mg: 1.2,
    vitamin_b6_mg: 1.1, vitamin_b12_ug: 2.4, folate_ug: 240, potassium_mg: 2000,
    magnesium_mg: 290, phosphorus_mg: 800, zinc_mg: 8,
  },
  "50-64": {
    energy_kcal: 1950, protein_g: 50, fat_g: 60, carb_g: 280, fiber_g: 18,
    salt_g: 6.5, calcium_mg: 650, iron_mg: 6.5, vitamin_a_ug: 700,
    vitamin_c_mg: 100, vitamin_d_ug: 8.5, vitamin_b1_mg: 1.1, vitamin_b2_mg: 1.2,
    vitamin_b6_mg: 1.1, vitamin_b12_ug: 2.4, folate_ug: 240, potassium_mg: 2000,
    magnesium_mg: 290, phosphorus_mg: 800, zinc_mg: 8,
  },
  "65+": {
    energy_kcal: 1750, protein_g: 50, fat_g: 53, carb_g: 250, fiber_g: 17,
    salt_g: 6.5, calcium_mg: 650, iron_mg: 6.0, vitamin_a_ug: 650,
    vitamin_c_mg: 100, vitamin_d_ug: 8.5, vitamin_b1_mg: 0.9, vitamin_b2_mg: 1.0,
    vitamin_b6_mg: 1.1, vitamin_b12_ug: 2.4, folate_ug: 240, potassium_mg: 2000,
    magnesium_mg: 260, phosphorus_mg: 800, zinc_mg: 8,
  },
};

const NUTRIENT_LABEL: Record<string, string> = {
  energy_kcal: "エネルギー", protein_g: "タンパク質", fat_g: "脂質",
  carb_g: "炭水化物", fiber_g: "食物繊維", salt_g: "食塩相当量",
  calcium_mg: "カルシウム", iron_mg: "鉄", vitamin_a_ug: "ビタミン A",
  vitamin_c_mg: "ビタミン C", vitamin_d_ug: "ビタミン D",
  vitamin_b1_mg: "ビタミン B1", vitamin_b2_mg: "ビタミン B2",
  vitamin_b6_mg: "ビタミン B6", vitamin_b12_ug: "ビタミン B12",
  folate_ug: "葉酸", potassium_mg: "カリウム", magnesium_mg: "マグネシウム",
  phosphorus_mg: "リン", zinc_mg: "亜鉛",
};

const UPPER_BOUND_KEYS = new Set(["salt_g"]);

function pickAgeGroup(birthYear: number | null): string {
  if (birthYear === null || !Number.isFinite(birthYear)) return "30-49";
  const age = new Date().getUTCFullYear() - birthYear;
  if (age < 30) return "18-29";
  if (age < 50) return "30-49";
  if (age < 65) return "50-64";
  return "65+";
}

// =====================================================================
// main handler
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

  // 2. 入力検証
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return badRequest("Invalid JSON body");
  }
  const monthStart = parseMonthStart(body.monthStart);
  if (!monthStart) {
    return badRequest("monthStart は YYYY-MM-01 形式で必要です");
  }

  // 3. 月次サマリーを取得（無ければエラー、recompute は別の Function 責務）
  const { data: summaryRow, error: sumErr } = await auth.supabase
    .from("nutrition_monthly_summaries")
    .select("summary")
    .eq("user_id", auth.userId)
    .eq("month_start", monthStart)
    .maybeSingle();
  if (sumErr) {
    console.error("[advise-nutrition] summary lookup failed:", sumErr.message);
    return badRequest("summary lookup failed");
  }
  if (!summaryRow) {
    return badRequest(
      "栄養サマリーが見つかりません。先に /nutrition で集計を実行してください。",
    );
  }
  const totals = (summaryRow.summary as { totals?: Record<string, number> }).totals ?? {};

  // 4. プロフィール取得
  const { data: profile } = await auth.supabase
    .from("user_profiles")
    .select("birth_year, goal_type, allergies, disliked_foods")
    .eq("user_id", auth.userId)
    .maybeSingle();
  const ageGroup = pickAgeGroup((profile?.birth_year as number | null) ?? null);
  const allergies = (profile?.allergies as string[] | undefined) ?? [];
  const dislikedFoods = (profile?.disliked_foods as string[] | undefined) ?? [];
  const goalType = (profile?.goal_type as string | null) ?? null;

  // 5. 達成率計算
  const days = daysInMonth(monthStart);
  const dailyRec = FEMALE_DAILY[ageGroup] ?? FEMALE_DAILY["30-49"]!;
  const achievements = Object.entries(NUTRIENT_LABEL)
    .map(([key, label]) => {
      const total = (totals[key] as number | undefined) ?? 0;
      const rec = dailyRec[key];
      if (rec == null || rec <= 0) return null;
      const pct = total / (rec * days);
      return {
        label,
        pct: Math.max(0, Math.min(2, pct)),
        isUpperBound: UPPER_BOUND_KEYS.has(key),
      };
    })
    .filter((x): x is { label: string; pct: number; isUpperBound: boolean } => x !== null);

  // 6. キャッシュキー
  const cacheKey = buildAdviceCacheKey({
    monthLabel: monthLabel(monthStart),
    ageGroup,
    monthDays: days,
    achievements,
    goalType,
    allergies,
    dislikedFoods,
  });
  const inputHash = await sha256Hex(cacheKey);

  // 7. キャッシュ検索（ai_advice_logs から同 hash を引く）
  const serviceClient = createServiceClient();
  const { data: cached } = await serviceClient
    .from("ai_advice_logs")
    .select("response")
    .eq("kind", "nutrition")
    .eq("user_id", auth.userId)
    .eq("request_payload->>input_hash", inputHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached?.response) {
    try {
      const advice = validateNutritionAdvice(cached.response);
      const success: SuccessResponse = {
        cached: true,
        advice,
        monthLabel: monthLabel(monthStart),
        ageGroup,
        monthDays: days,
      };
      return jsonResponse(success);
    } catch (err) {
      // キャッシュ破損なら再生成へ
      console.warn("[advise-nutrition] cached response invalid, regenerating:", err);
    }
  }

  // 8. 月次予算チェック
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
      `[advise-nutrition] budget exceeded but mode=soft, continuing. ${budgetStatus.monthly_total_jpy}/${budgetStatus.budget_jpy} JPY`,
    );
  }

  // 9. Gemini 呼出
  const apiKey = mustEnv("GEMINI_API_KEY");
  const model = getEnv("MODEL_ADVICE") ?? "gemini-3-pro";

  const prompt = buildNutritionAdvicePrompt({
    monthLabel: monthLabel(monthStart),
    ageGroup,
    monthDays: days,
    achievements,
    goalType,
    allergies,
    dislikedFoods,
  });

  try {
    const response = await callGemini(
      {
        system: prompt.system,
        user: prompt.user,
        jsonOutput: true,
      },
      { apiKey, model },
    );
    const parsed = parseJsonOutput<unknown>(response.data);
    const advice = validateNutritionAdvice(parsed);

    // 10. ai_advice_logs に記録（input_hash を payload に含めることで次回キャッシュ可能に）
    await logAiCall(serviceClient, {
      user_id: auth.userId,
      kind: "nutrition",
      model,
      request_payload: {
        monthStart,
        ageGroup,
        monthDays: days,
        achievements_count: achievements.length,
        goal_summary: { has_goal: goalType !== null },
        profile_summary: {
          allergies_count: allergies.length,
          disliked_count: dislikedFoods.length,
        },
        input_hash: inputHash,
      },
      response: advice,
      meta: response.meta,
    });

    const success: SuccessResponse = {
      cached: false,
      advice,
      monthLabel: monthLabel(monthStart),
      ageGroup,
      monthDays: days,
    };
    return jsonResponse(success);
  } catch (err) {
    const code = aiFailureCode(err);
    const status = code === "AI_TIMEOUT" ? 504 : code === "AI_BLOCKED" ? 422 : 502;
    const detail = err instanceof Error ? err.message : "unknown error";

    await logAiCall(serviceClient, {
      user_id: auth.userId,
      kind: "nutrition",
      model,
      request_payload: {
        monthStart,
        ageGroup,
        input_hash: inputHash,
      },
      error: detail,
    });

    return jsonResponse<EdgeError>(
      { error: "Nutrition advice generation failed", code, detail },
      { status },
    );
  }
});
