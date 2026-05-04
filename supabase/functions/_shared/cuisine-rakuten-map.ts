// 既存の cuisine 8 種から楽天レシピ API のカテゴリ ID へのマッピング。
//
// 楽天 CategoryRanking API は categoryId 必須で、large/medium/small の 3 階層を持つ。
// ここでは大カテゴリ（large）の ID を採用する（その下のすべてを含むランキング）。
//
// 出典: 楽天レシピカテゴリ一覧 API
// https://app.rakuten.co.jp/services/api/Recipe/CategoryList/20170426
//
// 楽天側で改廃される可能性があるため、年次で再取得して整合性を確認するのが望ましい。
// （scripts/fetch-rakuten-categories.ts を将来追加予定）

/** 既存 cuisine 値のリスト（types/database.ts の Cuisine と同じ）。
 *  Edge Function は Deno で動くため web/types/database.ts は import せず、
 *  ここに値を再定義する。両者を同期する責任は手動レビュー時に確認する。 */
export const SUPPORTED_CUISINES = [
  "japanese",
  "chinese",
  "italian",
  "french",
  "ethnic",
  "korean",
  "sweets",
  "other",
] as const;

export type SupportedCuisine = (typeof SUPPORTED_CUISINES)[number];

/** cuisine → 楽天 categoryId のマッピング（大カテゴリ）。
 *  楽天 API は categoryId を文字列で受け取る。 */
export const CUISINE_TO_RAKUTEN_CATEGORY: Record<SupportedCuisine, string> = {
  japanese: "27", // 和食
  chinese: "28", // 中華料理
  italian: "29", // イタリアン
  french: "30", // フレンチ
  ethnic: "31", // エスニック・各国料理
  korean: "32", // 韓国料理
  sweets: "21", // お菓子
  other: "33", // その他のカテゴリ
};

/** cuisine 文字列から楽天 categoryId を引く。未対応 cuisine では null を返す。 */
export function rakutenCategoryFor(cuisine: string): string | null {
  if (!isSupportedCuisine(cuisine)) return null;
  return CUISINE_TO_RAKUTEN_CATEGORY[cuisine];
}

/** 型ガード: 入力が SUPPORTED_CUISINES のいずれかかを判定 */
export function isSupportedCuisine(s: string): s is SupportedCuisine {
  return (SUPPORTED_CUISINES as readonly string[]).includes(s);
}
