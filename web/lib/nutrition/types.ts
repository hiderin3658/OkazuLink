// 月次栄養集計の型定義
//
// foods.nutrition_per_100g で扱う栄養素キーに加え、集計メタ情報
// （計算対象件数・未マッチ件数）を持つ。

/** foods.nutrition_per_100g に含まれる栄養素キー（順序は表示順を意識） */
export const NUTRIENT_KEYS = [
  "energy_kcal",
  "protein_g",
  "fat_g",
  "carb_g",
  "fiber_g",
  "salt_g",
  "calcium_mg",
  "iron_mg",
  "vitamin_a_ug",
  "vitamin_c_mg",
  "vitamin_d_ug",
  "vitamin_b1_mg",
  "vitamin_b2_mg",
  "vitamin_b6_mg",
  "vitamin_b12_ug",
  "folate_ug",
  "potassium_mg",
  "magnesium_mg",
  "phosphorus_mg",
  "zinc_mg",
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** 栄養素ごとの単位ラベル（UI 表示で利用） */
export const NUTRIENT_UNIT: Record<NutrientKey, string> = {
  energy_kcal: "kcal",
  protein_g: "g",
  fat_g: "g",
  carb_g: "g",
  fiber_g: "g",
  salt_g: "g",
  calcium_mg: "mg",
  iron_mg: "mg",
  vitamin_a_ug: "μg",
  vitamin_c_mg: "mg",
  vitamin_d_ug: "μg",
  vitamin_b1_mg: "mg",
  vitamin_b2_mg: "mg",
  vitamin_b6_mg: "mg",
  vitamin_b12_ug: "μg",
  folate_ug: "μg",
  potassium_mg: "mg",
  magnesium_mg: "mg",
  phosphorus_mg: "mg",
  zinc_mg: "mg",
};

/** 栄養素ラベル（日本語） */
export const NUTRIENT_LABEL: Record<NutrientKey, string> = {
  energy_kcal: "エネルギー",
  protein_g: "タンパク質",
  fat_g: "脂質",
  carb_g: "炭水化物",
  fiber_g: "食物繊維",
  salt_g: "食塩相当量",
  calcium_mg: "カルシウム",
  iron_mg: "鉄",
  vitamin_a_ug: "ビタミン A",
  vitamin_c_mg: "ビタミン C",
  vitamin_d_ug: "ビタミン D",
  vitamin_b1_mg: "ビタミン B1",
  vitamin_b2_mg: "ビタミン B2",
  vitamin_b6_mg: "ビタミン B6",
  vitamin_b12_ug: "ビタミン B12",
  folate_ug: "葉酸",
  potassium_mg: "カリウム",
  magnesium_mg: "マグネシウム",
  phosphorus_mg: "リン",
  zinc_mg: "亜鉛",
};

/** 集計結果（jsonb で nutrition_monthly_summaries.summary に保存） */
export interface NutritionSummary {
  /** 各栄養素の合計値。null 安全に number で扱い、計算不可は 0 として加算（unmatched_count で別途トレース） */
  totals: Record<NutrientKey, number>;
  /** 計算対象 record 数 */
  record_count: number;
  /** 計算対象 item 数 */
  item_count: number;
  /** food_id が null または foods から引けず、計算に含められなかった item 数 */
  unmatched_count: number;
  /** 計算根拠コメント（フェーズ 2 MVP の前提を UI で出すため） */
  notes: string[];
}

/** foods.nutrition_per_100g の最小限の形 */
export type NutritionPer100g = Partial<Record<NutrientKey, number | null>>;
