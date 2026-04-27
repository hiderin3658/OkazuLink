// 食品データ JSON → ParsedFood[] への変換ロジック
//
// 純粋関数として実装することで vitest によるユニットテストを容易にする。

import {
  FOOD_SOURCE_TEXT,
  GROUP_SPECS,
  NUTRITION_KEY_MAP,
  type FoodCategory,
  type ParsedFood,
  type RawFoodRow,
} from "./foods-mapping";

// =====================================================================
// 内部ヘルパー
// =====================================================================

/** foodId(数値) を 5 桁ゼロ埋めの code 文字列にする */
function formatCode(foodId: number): string {
  return String(foodId).padStart(5, "0");
}

/** groupId から food_group / category を引く（未知の groupId は other 扱い） */
function resolveGroup(groupId: number): { food_group: string; category: FoodCategory } {
  const spec = GROUP_SPECS[groupId];
  if (!spec) {
    return { food_group: `${String(groupId).padStart(2, "0")} 不明`, category: "other" };
  }
  return { food_group: spec.name, category: spec.category };
}

/** "Tr" / "-" / 文字列等の非数値を null に正規化する */
export function normalizeNutritionValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    // "Tr" (痕跡量), "-" (未測定), "(数値)" (推定値) は MVP では null として扱う
    if (trimmed === "" || trimmed === "Tr" || trimmed === "-" || /^\(.*\)$/.test(trimmed)) {
      return null;
    }
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** RawFoodRow から保持対象の栄養素のみ抜き出して jsonb 形式の object を作る */
export function extractNutrition(row: RawFoodRow): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const [srcKey, dstKey] of Object.entries(NUTRITION_KEY_MAP)) {
    result[dstKey] = normalizeNutritionValue(row[srcKey]);
  }
  return result;
}

/** 食品名の前後空白・連続空白を整える（中黒や記号は維持） */
export function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

// =====================================================================
// メイン関数
// =====================================================================

/**
 * RawFoodRow[] を ParsedFood[] に変換する純粋関数。
 *
 * @param rows katoharu432/standards-tables-of-food-composition-in-japan の data.json
 * @returns DB upsert に使える形に整形した foods 行
 */
export function parseFoodSource(rows: RawFoodRow[]): ParsedFood[] {
  return rows.map((row) => {
    const { food_group, category } = resolveGroup(row.groupId);
    return {
      code: formatCode(row.foodId),
      name: normalizeName(row.foodName),
      category,
      food_group,
      nutrition_per_100g: extractNutrition(row),
      source: FOOD_SOURCE_TEXT,
    };
  });
}
