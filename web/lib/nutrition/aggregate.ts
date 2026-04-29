// 月次栄養集計の純粋関数
//
// shopping_records / shopping_items / foods (nutrition_per_100g) を入力に、
// 月別の栄養合計を計算する。テスト容易性のため fetch / DB アクセスを含めない。
//
// MVP 前提:
//   - quantity の単位が "g" / "グラム" → そのまま grams として扱う
//   - "kg" / "キログラム" → × 1000
//   - "ml" / "L" / "リットル" → 水と同密度として g 換算（飲料の概算）
//   - その他（個 / パック / 袋など） → 1 個 100g 換算（暫定）
//   - quantity が null → 1 として扱う（最低 1 食材分は加算）
//
// この前提は notes に記録して UI に提示する（ユーザー誤解防止）。

import {
  NUTRIENT_KEYS,
  type NutrientKey,
  type NutritionPer100g,
  type NutritionSummary,
} from "./types";

interface AggInputItem {
  /** food_id が null（未マッチ）の場合は集計対象外として unmatched_count に算入 */
  food_id: string | null;
  quantity: number | null;
  unit: string | null;
}

interface AggInputRecord {
  shopping_items: AggInputItem[];
}

/** 単位文字列から食材重量を g 換算する */
export function estimateGrams(quantity: number | null, unit: string | null): number {
  const q = quantity == null || !Number.isFinite(quantity) ? 1 : Math.max(0, quantity);
  if (q === 0) return 0;
  const u = (unit ?? "").trim().toLowerCase();
  if (u === "g" || u === "グラム" || u === "ｇ") return q;
  if (u === "kg" || u === "キログラム" || u === "ｋｇ") return q * 1000;
  if (u === "mg" || u === "ミリグラム") return q / 1000;
  // 飲料: 水と同等密度として g 換算（厳密には密度差あり。MVP 段階では概算）
  if (u === "ml" || u === "ミリリットル" || u === "ｍｌ") return q;
  if (u === "l" || u === "リットル" || u === "ℓ") return q * 1000;
  // その他（個 / パック / 袋 / 本 / 枚 など）: 1 個 = 100g として概算
  return q * 100;
}

/** 空の集計結果を返す（全栄養素 0、件数 0） */
export function createEmptySummary(): NutritionSummary {
  const totals = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0])) as Record<NutrientKey, number>;
  return {
    totals,
    record_count: 0,
    item_count: 0,
    unmatched_count: 0,
    notes: [],
  };
}

/** 食材の 100g あたり栄養 × 実重量(g) ÷ 100 を totals に加算する */
export function accumulateNutrition(
  totals: Record<NutrientKey, number>,
  per100g: NutritionPer100g,
  grams: number,
): void {
  if (grams <= 0) return;
  const factor = grams / 100;
  for (const k of NUTRIENT_KEYS) {
    const v = per100g[k];
    if (v == null || !Number.isFinite(v)) continue;
    totals[k] += v * factor;
  }
}

/** メイン: 月次の records と foods マップから NutritionSummary を作る */
export function aggregateMonthly(
  records: AggInputRecord[],
  foods: Map<string, NutritionPer100g>,
): NutritionSummary {
  const summary = createEmptySummary();

  let usedQuantityFallback = false;
  let usedUnitFallback = false;

  for (const rec of records) {
    summary.record_count += 1;
    for (const item of rec.shopping_items ?? []) {
      summary.item_count += 1;
      if (!item.food_id) {
        summary.unmatched_count += 1;
        continue;
      }
      const food = foods.get(item.food_id);
      if (!food) {
        summary.unmatched_count += 1;
        continue;
      }
      if (item.quantity == null) usedQuantityFallback = true;
      const knownUnits = new Set([
        "g",
        "グラム",
        "ｇ",
        "kg",
        "キログラム",
        "ｋｇ",
        "mg",
        "ミリグラム",
        "ml",
        "ミリリットル",
        "ｍｌ",
        "l",
        "リットル",
        "ℓ",
      ]);
      const unitLower = (item.unit ?? "").trim().toLowerCase();
      if (unitLower && !knownUnits.has(unitLower)) {
        usedUnitFallback = true;
      }
      const grams = estimateGrams(item.quantity, item.unit);
      accumulateNutrition(summary.totals, food, grams);
    }
  }

  // 各栄養素を小数 2 桁に丸める（jsonb ストレージと UI 表示の一貫性）
  for (const k of NUTRIENT_KEYS) {
    summary.totals[k] = Math.round(summary.totals[k] * 100) / 100;
  }

  if (usedQuantityFallback) {
    summary.notes.push("数量が未入力の食材を 1 個として概算しています。");
  }
  if (usedUnitFallback) {
    summary.notes.push(
      "g/kg/ml/L 以外の単位（個・パック等）は 1 個 = 100g として概算しています。",
    );
  }
  if (summary.unmatched_count > 0) {
    summary.notes.push(
      `${summary.unmatched_count} 件の食材は foods マスタと紐付かず栄養計算から除外しました。`,
    );
  }
  return summary;
}
