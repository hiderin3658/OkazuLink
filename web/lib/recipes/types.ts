// suggest-recipes Edge Function の入出力型をクライアントから扱いやすい形で公開する。
// 元の型は supabase/functions/_shared/types.ts に存在するが、Next.js 側からは
// 直接 import できないため、ここで再宣言する（DB 由来の Recipe 型とは別物の点に注意）。

import type { Cuisine } from "@/types/database";

export interface SuggestRecipesProfile {
  allergies?: string[];
  disliked?: string[];
  goal_type?: string | null;
}

export interface SuggestRecipesInput {
  ingredients: string[];
  cuisine: Cuisine;
  servings?: number;
  candidateCount?: number;
  profile?: SuggestRecipesProfile;
}

export interface RecipeIngredientSuggestion {
  name: string;
  amount: string;
  optional: boolean;
}

export interface RecipeSuggestion {
  id: string;
  title: string;
  cuisine: string;
  description: string;
  servings: number;
  time_minutes: number;
  calories_kcal: number | null;
  ingredients: RecipeIngredientSuggestion[];
  steps: string[];
}

export interface SuggestRecipesResponse {
  cached: boolean;
  results: RecipeSuggestion[];
}
