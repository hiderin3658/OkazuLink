// 買物関連の Server Component 向け データ取得ヘルパー
//
// すべて RLS で守られているため authenticated user のもののみ返る前提。
// middleware で /shopping パスは認証必須にしている。

import { createClient } from "@/lib/supabase/server";
import type { ShoppingRecord, ShoppingRecordWithItems } from "@/types/database";

/** 買物履歴 N 件取得（新しい順）。LIMIT は安全な上限を設ける。 */
export async function listShoppingRecords(limit = 50): Promise<ShoppingRecord[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shopping_records")
    .select("*")
    .order("purchased_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ShoppingRecord[];
}

/** 単一の買物記録（明細含む）を取得。RLS で他ユーザーのは弾かれる。 */
export async function getShoppingRecord(
  id: string,
): Promise<ShoppingRecordWithItems | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shopping_records")
    .select("*, shopping_items(*)")
    .eq("id", id)
    .maybeSingle();
  return (data as ShoppingRecordWithItems | null) ?? null;
}

/** 月別合計（YYYY-MM をキーにした合計金額）を直近 N ヶ月で集計する */
export async function getMonthlySummary(months = 6): Promise<
  { year_month: string; total: number; record_count: number }[]
> {
  const supabase = await createClient();
  // 簡易実装: 直近 N ヶ月分の records を取って JS 側で集計。
  // 件数が増えてきたら DB View に置き換える（Phase 2 で対応）。
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().slice(0, 10);
  const { data } = await supabase
    .from("shopping_records")
    .select("purchased_at, total_amount")
    .gte("purchased_at", sinceStr)
    .order("purchased_at", { ascending: false });
  const map = new Map<string, { total: number; record_count: number }>();
  for (const r of (data ?? []) as { purchased_at: string; total_amount: number }[]) {
    const ym = r.purchased_at.slice(0, 7); // YYYY-MM
    const cur = map.get(ym) ?? { total: 0, record_count: 0 };
    cur.total += r.total_amount;
    cur.record_count += 1;
    map.set(ym, cur);
  }
  return [...map.entries()]
    .map(([year_month, v]) => ({ year_month, ...v }))
    .sort((a, b) => (a.year_month < b.year_month ? 1 : -1));
}

/** 直近 N 件の買物明細を集めて、ユニークな食材名のリストを返す
 * （レシピ提案で「手持ち食材」候補に使う） */
export async function getRecentIngredientNames(limit = 30): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shopping_items")
    .select("raw_name, display_name, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of (data ?? []) as { raw_name: string; display_name: string | null }[]) {
    const name = it.display_name ?? it.raw_name;
    if (!seen.has(name)) {
      seen.add(name);
      out.push(name);
      if (out.length >= limit) break;
    }
  }
  return out;
}
