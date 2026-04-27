// Edge Function 共有型定義
//
// すべての Edge Function (extract-receipt / suggest-recipes / advise-nutrition 等) で
// 共通利用する型を集約する。

/** ai_advice_logs.kind に対応 */
export type AiKind =
  | "ocr"
  | "ocr_fallback"
  | "recipe"
  | "nutrition"
  | "coach"
  | "report"
  | "estimate_food";

/** Gemini モデル識別子（環境変数で差替可能） */
export type GeminiModel = string;

/** Gemini API 呼出のメタ情報。レスポンスとともに ai_advice_logs に記録される */
export interface GeminiCallMeta {
  model: GeminiModel;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
}

export interface GeminiCallResult<T> {
  data: T;
  meta: GeminiCallMeta;
}

/** AI 予算モード（環境変数 AI_BUDGET_MODE） */
export type BudgetMode = "soft" | "hard";

/** Edge Function の標準エラーコード（クライアント側が string-match で分岐できるよう union 化） */
export const EDGE_ERROR_CODES = [
  "AUTH_MISSING_TOKEN",
  "AUTH_INVALID_TOKEN",
  "AUTH_NOT_ALLOWED",
  "AUTH_DB_ERROR",
  "BAD_REQUEST",
  "BUDGET_EXCEEDED",
  "AI_BLOCKED",
  "AI_TIMEOUT",
  "AI_INVALID_RESPONSE",
  "INTERNAL_ERROR",
] as const;

export type EdgeErrorCode = (typeof EDGE_ERROR_CODES)[number];

/** Edge Function の標準エラーレスポンス */
export interface EdgeError {
  error: string;
  code: EdgeErrorCode;
  detail?: string;
}

/** OCR 結果（extract-receipt 用、PR-C で実装） */
export interface OcrItem {
  raw_name: string;
  quantity: number | null;
  unit: string | null;
  total_price: number;
  category: string;
}

export interface OcrResult {
  store_name: string | null;
  purchased_at: string;
  total_amount: number;
  items: OcrItem[];
  discounts: { label: string; amount: number }[];
  confidence: number;
}

/** レシピ候補（suggest-recipes 用、PR-E で実装） */
export interface RecipeIngredientSuggestion {
  name: string;
  amount: string;
  optional: boolean;
}

export interface RecipeSuggestion {
  title: string;
  cuisine: string;
  description: string;
  servings: number;
  time_minutes: number;
  calories_kcal: number | null;
  ingredients: RecipeIngredientSuggestion[];
  steps: string[];
}
