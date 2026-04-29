// Gemini が返した栄養アドバイス JSON を検証・整形する。
//
// 純粋関数として実装し vitest で検証可能。

import type {
  AdviceImportance,
  NutritionAdvice,
  NutritionDeficiency,
  NutritionRecommendation,
} from "../_shared/types.ts";

const VALID_IMPORTANCE = new Set<AdviceImportance>(["high", "medium", "low"]);

export class AdviceValidationError extends Error {
  constructor(message: string, public readonly path?: string) {
    super(message);
    this.name = "AdviceValidationError";
  }
}

function asString(v: unknown, fallback = ""): string {
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  return fallback;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function safeImportance(v: unknown): AdviceImportance {
  if (typeof v === "string" && VALID_IMPORTANCE.has(v as AdviceImportance)) {
    return v as AdviceImportance;
  }
  return "medium";
}

function validateDeficiency(raw: unknown, idx: number): NutritionDeficiency {
  if (typeof raw !== "object" || raw === null) {
    throw new AdviceValidationError(
      `deficiencies[${idx}] is not an object`,
      `deficiencies[${idx}]`,
    );
  }
  const r = raw as Record<string, unknown>;
  const nutrient = asString(r.nutrient);
  if (!nutrient) {
    throw new AdviceValidationError(
      `deficiencies[${idx}].nutrient is required`,
      `deficiencies[${idx}].nutrient`,
    );
  }
  const pctRaw = toNum(r.achievement_pct);
  // 0..200 にクランプ。null は 0
  const achievement_pct = pctRaw === null ? 0 : Math.max(0, Math.min(200, pctRaw));
  return {
    nutrient,
    achievement_pct,
    importance: safeImportance(r.importance),
    reason: asString(r.reason, "（理由なし）"),
  };
}

function validateRecommendation(raw: unknown, idx: number): NutritionRecommendation {
  if (typeof raw !== "object" || raw === null) {
    throw new AdviceValidationError(
      `recommendations[${idx}] is not an object`,
      `recommendations[${idx}]`,
    );
  }
  const r = raw as Record<string, unknown>;
  const food_name = asString(r.food_name);
  if (!food_name) {
    throw new AdviceValidationError(
      `recommendations[${idx}].food_name is required`,
      `recommendations[${idx}].food_name`,
    );
  }
  const nutrients = Array.isArray(r.nutrients)
    ? r.nutrients
        .map((n) => (typeof n === "string" ? n.trim() : ""))
        .filter((n) => n.length > 0)
    : [];
  return {
    food_name,
    reason: asString(r.reason, "（理由なし）"),
    nutrients,
  };
}

/** Gemini レスポンスを NutritionAdvice に整形。
 *  必須: summary_comment が非空、deficiencies / recommendations が配列。
 *  各要素は防御的に整形（足りないフィールドは fallback、必須欠落は throw）。 */
export function validateNutritionAdvice(raw: unknown): NutritionAdvice {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new AdviceValidationError("Response is not an object");
  }
  const r = raw as Record<string, unknown>;

  const summary_comment = asString(r.summary_comment);
  if (!summary_comment) {
    throw new AdviceValidationError("summary_comment is required", "summary_comment");
  }

  if (!Array.isArray(r.deficiencies)) {
    throw new AdviceValidationError("deficiencies must be an array", "deficiencies");
  }
  if (!Array.isArray(r.recommendations)) {
    throw new AdviceValidationError("recommendations must be an array", "recommendations");
  }

  const deficiencies = r.deficiencies.map((d, i) => validateDeficiency(d, i));
  const recommendations = r.recommendations.map((rec, i) => validateRecommendation(rec, i));

  return {
    summary_comment,
    deficiencies,
    recommendations,
  };
}
