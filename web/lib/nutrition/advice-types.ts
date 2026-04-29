// advise-nutrition Edge Function の I/O 型をクライアントから扱いやすい形で公開する。
// 元の型は supabase/functions/_shared/types.ts にあるが、Deno-style import の
// ため Next.js 側からは直接 import できない。ここで再宣言する（同期は手動運用）。

export type AdviceImportance = "high" | "medium" | "low";

export interface NutritionDeficiency {
  nutrient: string;
  achievement_pct: number;
  importance: AdviceImportance;
  reason: string;
}

export interface NutritionRecommendation {
  food_name: string;
  reason: string;
  nutrients: string[];
}

export interface NutritionAdvice {
  summary_comment: string;
  deficiencies: NutritionDeficiency[];
  recommendations: NutritionRecommendation[];
}

export interface AdviceResponse {
  cached: boolean;
  advice: NutritionAdvice;
  monthLabel: string;
  ageGroup: string;
  monthDays: number;
}
