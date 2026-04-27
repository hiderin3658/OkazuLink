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

export interface UserProfile {
  user_id: string;
  display_name: string | null;
  birth_year: number | null;
  height_cm: number | null;
  target_weight_kg: number | null;
  goal_type: "diet" | "muscle" | "maintenance" | "custom" | null;
  allergies: string[];
  disliked_foods: string[];
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
