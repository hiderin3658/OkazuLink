// foods マスタからマッチング用の最小データを取得する。
//
// Server Action / API ルートから呼ばれることを想定。RLS で全認証ユーザーが
// 読めるようになっているため、authenticated client でも service_role でも動く。

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildFoodIndex, type FoodEntry } from "./matcher";

/** foods から id / name / aliases だけを取得し、正規化済みインデックスを返す。 */
export async function loadFoodIndex(
  supabase: SupabaseClient,
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("foods")
    .select("id, name, aliases");
  if (error) {
    console.error("[foods] loadFoodIndex failed:", error.message);
    return new Map();
  }
  return buildFoodIndex((data ?? []) as FoodEntry[]);
}
