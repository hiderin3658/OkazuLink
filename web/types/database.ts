// Supabase DB 型定義
// 実運用時は `supabase gen types typescript` で自動生成を推奨
// ここでは最小限の手書き型を定義

export type UserRole = "admin" | "user";

export interface AllowedUser {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export const GOAL_TYPES = ["diet", "muscle", "maintenance", "custom"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

export const GOAL_TYPE_LABEL: Record<GoalType, string> = {
  diet: "ダイエット",
  muscle: "筋力アップ",
  maintenance: "健康維持",
  custom: "カスタム",
};

export const RECIPE_SOURCE_PREFERENCES = ["ai", "rakuten"] as const;
export type RecipeSourcePreference = (typeof RECIPE_SOURCE_PREFERENCES)[number];

export const RECIPE_SOURCE_PREFERENCE_LABEL: Record<RecipeSourcePreference, string> = {
  ai: "AI 生成（おすすめ・自分の食材で）",
  rakuten: "楽天レシピ（無料・人気ランキング）",
};

export interface UserProfile {
  user_id: string;
  display_name: string | null;
  birth_year: number | null;
  height_cm: number | null;
  target_weight_kg: number | null;
  goal_type: GoalType | null;
  allergies: string[];
  disliked_foods: string[];
  /** P-14: レシピ提案のデフォルトソース。リクエスト時に上書き可。 */
  default_recipe_source: RecipeSourcePreference;
  created_at: string;
  updated_at: string;
}

export interface Food {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  nutrition_per_100g: Record<string, number | null>;
  source: string;
}

// =====================================================================
// foods テーブルと一致する category enum（DB 側 public.food_category）
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

export const FOOD_CATEGORY_LABEL: Record<FoodCategory, string> = {
  vegetable: "野菜",
  meat: "肉",
  fish: "魚介",
  dairy: "乳製品",
  grain: "穀類",
  seasoning: "調味料",
  beverage: "飲料",
  sweet: "菓子",
  fruit: "果物",
  egg: "卵",
  other: "その他",
};

// =====================================================================
// shopping_records / shopping_items
// =====================================================================
export type ShoppingSource = "receipt" | "manual";

export interface ShoppingRecord {
  id: string;
  user_id: string;
  purchased_at: string; // YYYY-MM-DD
  store_name: string | null;
  total_amount: number;
  note: string | null;
  image_paths: string[];
  source_type: ShoppingSource;
  created_at: string;
}

export interface ShoppingItem {
  id: string;
  shopping_record_id: string;
  food_id: string | null;
  raw_name: string;
  display_name: string | null;
  category: FoodCategory;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  total_price: number;
  discount: number;
  created_at: string;
}

// shopping_records と items を結合した表示用型
export type ShoppingRecordWithItems = ShoppingRecord & {
  shopping_items: ShoppingItem[];
};

// =====================================================================
// recipes / recipe_ingredients / saved_recipes
// =====================================================================
export const CUISINES = [
  "japanese",
  "chinese",
  "italian",
  "french",
  "ethnic",
  "korean",
  "sweets",
  "other",
] as const;

export type Cuisine = (typeof CUISINES)[number];

export const CUISINE_LABEL: Record<Cuisine, string> = {
  japanese: "和食",
  chinese: "中華",
  italian: "イタリアン",
  french: "フレンチ",
  ethnic: "エスニック",
  korean: "韓国",
  sweets: "スイーツ",
  other: "その他",
};

export type RecipeSource = "ai_generated" | "external";

/** 外部レシピの提供元（source='external' のとき external_provider に入る値）。
 *  P-14 で 'rakuten' を導入。将来 'cookpad' 等を追加する想定。 */
export const EXTERNAL_RECIPE_PROVIDERS = ["rakuten"] as const;
export type ExternalRecipeProvider = (typeof EXTERNAL_RECIPE_PROVIDERS)[number];

export interface Recipe {
  id: string;
  title: string;
  cuisine: Cuisine;
  description: string | null;
  servings: number | null;
  time_minutes: number | null;
  calories_kcal: number | null;
  steps: string[]; // jsonb array
  source: RecipeSource;
  generated_prompt_hash: string | null;
  /** P-14: 外部 API 由来時のサブ識別子（'rakuten' 等）。source='ai_generated' なら null。 */
  external_provider: ExternalRecipeProvider | null;
  /** P-14: 外部 API 側のレシピ ID（楽天: recipeId）。 */
  external_id: number | null;
  /** P-14: 外部レシピの公式 URL（詳細画面の遷移先）。 */
  external_url: string | null;
  /** P-14: サムネイル画像 URL。`<img referrerpolicy="no-referrer">` で表示する。 */
  external_image_url: string | null;
  /** P-14: provider 固有の追加メタ（投稿者名・公開日・所要・費用感など）。 */
  external_meta: Record<string, unknown> | null;
  created_at: string;
}

/** P-14: rakuten_recipe_cache テーブル。cuisine 単位のランキングキャッシュ。 */
export interface RakutenRecipeCache {
  cuisine: Cuisine;
  rakuten_category_id: string;
  recipe_ids: string[]; // recipes.id の配列（順位順）
  fetched_at: string;
  api_response_meta: Record<string, unknown> | null;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  food_id: string | null;
  name: string;
  amount: string | null;
  optional: boolean;
}

export type RecipeWithIngredients = Recipe & {
  recipe_ingredients: RecipeIngredient[];
};

export interface SavedRecipe {
  id: string;
  user_id: string;
  recipe_id: string;
  note: string | null;
  created_at: string;
}
