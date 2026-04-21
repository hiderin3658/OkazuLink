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
