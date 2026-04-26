// 食品マスタ投入用の定数と型定義
//
// データソース: katoharu432/standards-tables-of-food-composition-in-japan (CC BY 4.0)
// 出典:         文部科学省 日本食品標準成分表2020年版（八訂）
//
// このファイルは web/ に依存させず、tsx でそのまま実行できるよう自立させている。

// =====================================================================
// food_category enum（DB 側と完全一致させること）
// =====================================================================
export const FOOD_CATEGORIES = [
  "vegetable",
  "meat",
  "fish",
  "dairy",
  "grain",
  "seasoning",
  "beverage",
  "sweet",
  "fruit",
  "egg",
  "other",
] as const;

export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

// =====================================================================
// groupId (1..18) → 食品群名 / category マッピング
// MEXT 八訂の食品群と OkazuLink のカテゴリ enum を対応付ける
// =====================================================================
type GroupSpec = {
  name: string; // 食品群名（"01 穀類" のような形式で foods.food_group に保存）
  category: FoodCategory;
};

export const GROUP_SPECS: Record<number, GroupSpec> = {
  1: { name: "01 穀類", category: "grain" },
  2: { name: "02 いも及びでん粉類", category: "vegetable" },
  3: { name: "03 砂糖及び甘味類", category: "seasoning" },
  4: { name: "04 豆類", category: "vegetable" },
  5: { name: "05 種実類", category: "other" },
  6: { name: "06 野菜類", category: "vegetable" },
  7: { name: "07 果実類", category: "fruit" },
  8: { name: "08 きのこ類", category: "vegetable" },
  9: { name: "09 藻類", category: "vegetable" },
  10: { name: "10 魚介類", category: "fish" },
  11: { name: "11 肉類", category: "meat" },
  12: { name: "12 卵類", category: "egg" },
  13: { name: "13 乳類", category: "dairy" },
  14: { name: "14 油脂類", category: "seasoning" },
  15: { name: "15 菓子類", category: "sweet" },
  16: { name: "16 し好飲料類", category: "beverage" },
  17: { name: "17 調味料及び香辛料類", category: "seasoning" },
  18: { name: "18 調理済み流通食品類", category: "other" },
};

// =====================================================================
// 栄養素キーマッピング
// katoharu432 の JSON キー → OkazuLink で保持する jsonb キー
//
// 全項目は持たず、主要な栄養素のみ採用（PFC、食物繊維、塩、主要ミネラル・ビタミン）
// 設計書 9 章および supabase/scripts/README.md の方針に従う
// =====================================================================
export const NUTRITION_KEY_MAP: Record<string, string> = {
  enercKcal: "energy_kcal",
  prot: "protein_g",
  fat: "fat_g",
  chocdf: "carb_g",
  fib: "fiber_g",
  naclEq: "salt_g",
  ca: "calcium_mg",
  fe: "iron_mg",
  vitaRae: "vitamin_a_ug",
  vitC: "vitamin_c_mg",
  vitD: "vitamin_d_ug",
  thia: "vitamin_b1_mg",
  ribf: "vitamin_b2_mg",
  vitB6A: "vitamin_b6_mg",
  vitB12: "vitamin_b12_ug",
  fol: "folate_ug",
  k: "potassium_mg",
  mg: "magnesium_mg",
  p: "phosphorus_mg",
  zn: "zinc_mg",
};

// =====================================================================
// 入出力型
// =====================================================================
export type RawFoodRow = {
  groupId: number;
  foodId: number;
  indexId: number;
  foodName: string;
  // その他多数の栄養フィールドが number | null として続く
  [key: string]: number | string | null;
};

export type ParsedFood = {
  code: string; // 5 桁ゼロ埋め: "01001"
  name: string;
  category: FoodCategory;
  food_group: string;
  nutrition_per_100g: Record<string, number | null>;
  source: string;
};

export const FOOD_SOURCE_TEXT = "文部科学省 日本食品標準成分表2020年版（八訂）";
