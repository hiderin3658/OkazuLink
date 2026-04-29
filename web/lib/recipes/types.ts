// suggest-recipes Edge Function の入出力型をクライアントから扱いやすい形で公開する。
//
// 元の型は supabase/functions/_shared/types.ts に存在するが、そちらは Deno-style
// の `.ts` 拡張子付き相対パス import で書かれており、Next.js (vitest) 側からは
// import 解決できないため、本ファイルで再宣言する。
//
// 同期は手動運用：Edge Function 側のスキーマを変更したら、本ファイルも更新する。
// 差分:
//   - _shared/types.ts: RecipeSuggestion に id を持たない（Gemini 生成段階）
//   - 本ファイル: RecipeSuggestion に id (DB 永続化後) を持つ
// この差は意図的（DB 永続化前後の状態を表す）。

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
