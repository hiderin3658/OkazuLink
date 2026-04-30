// foods マスタからマッチング用の最小データを取得する。
//
// Server Action / API ルートから呼ばれることを想定。RLS で全認証ユーザーが
// 読めるようになっているため、authenticated client でも service_role でも動く。

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFoodIndex, type FoodEntry } from "./matcher";

/** PostgREST のデフォルト LIMIT。Supabase は単発 select で最大 1,000 行までしか
 *  返さないため、それを超える foods（現在 2,478 件）は range で複数ページ取得する */
const FOODS_PAGE_SIZE = 1000;

/** range pagination の無限ループ保護用のハードリミット。
 *  foods は 2,478 件規模を想定しており、PAGE_SIZE=1000 なら 3 反復で完了する。
 *  PostgREST 側の挙動異常で同じデータが返り続けても 10 反復で打ち切る。 */
const FOODS_MAX_PAGES = 10;

/** foods から id / name / aliases だけを取得し、正規化済みインデックスを返す。
 *  並び順を code 昇順で固定することで、同名食材が複数あった場合のマッチング
 *  決定論性を保証する（buildFoodIndex は最初に登録された ID を優先するため、
 *  foodId が小さい "生" 状態が選ばれる）。 */
export async function loadFoodIndex(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const all: FoodEntry[] = [];
  let from = 0;
  let page = 0;
  while (page < FOODS_MAX_PAGES) {
    const { data, error } = await supabase
      .from("foods")
      .select("id, name, aliases")
      .order("code", { ascending: true })
      .range(from, from + FOODS_PAGE_SIZE - 1);
    if (error) {
      console.error("[foods] loadFoodIndex failed:", error.message);
      return new Map();
    }
    if (!data || data.length === 0) break;
    all.push(...(data as FoodEntry[]));
    // 1 ページ未満しか返ってこなければ最終ページ
    if (data.length < FOODS_PAGE_SIZE) break;
    from += FOODS_PAGE_SIZE;
    page++;
  }
  if (page >= FOODS_MAX_PAGES) {
    console.error(
      `[foods] loadFoodIndex hit MAX_PAGES=${FOODS_MAX_PAGES}, possible infinite loop`,
    );
  }
  return buildFoodIndex(all);
}
