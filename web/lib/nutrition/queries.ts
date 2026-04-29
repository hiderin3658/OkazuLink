// 月次栄養関連の Server Component 向けデータ取得ヘルパー
//
// 集計には複数テーブル（shopping_records / shopping_items / foods）
// を組み合わせる必要があるため、必要なクエリをここに集める。

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { NutritionPer100g, NutritionSummary } from "./types";

const FRESH_HOURS = 24;

/** 月初日（YYYY-MM-01）を YYYY-MM-DD で返す。当月を引く目的で使う。 */
export function currentMonthStart(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

/** 任意の月の翌月初日（exclusive end）を返す。範囲クエリに使う。 */
export function nextMonthStart(monthStart: string): string {
  const [y, m] = monthStart.split("-").map(Number);
  if (!y || !m) throw new Error(`Invalid month_start: ${monthStart}`);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

interface MonthlyShoppingData {
  records: { shopping_items: { food_id: string | null; quantity: number | null; unit: string | null }[] }[];
}

/** 指定月の shopping_records と明細を取得（items の food_id / quantity / unit のみ） */
export async function fetchMonthlyShoppingData(
  supabase: SupabaseClient,
  userId: string,
  monthStart: string,
): Promise<MonthlyShoppingData> {
  const since = monthStart;
  const until = nextMonthStart(monthStart);
  const { data, error } = await supabase
    .from("shopping_records")
    .select("shopping_items(food_id, quantity, unit)")
    .eq("user_id", userId)
    .gte("purchased_at", since)
    .lt("purchased_at", until);
  if (error) {
    console.error("[nutrition] fetchMonthlyShoppingData failed:", error.message);
    return { records: [] };
  }
  return {
    records: (data ?? []) as MonthlyShoppingData["records"],
  };
}

/** records 内の食材 ID から foods.nutrition_per_100g マップを引く */
export async function fetchFoodsForAggregation(
  supabase: SupabaseClient,
  records: MonthlyShoppingData["records"],
): Promise<Map<string, NutritionPer100g>> {
  const ids = new Set<string>();
  for (const rec of records) {
    for (const item of rec.shopping_items ?? []) {
      if (item.food_id) ids.add(item.food_id);
    }
  }
  if (ids.size === 0) return new Map();
  const { data, error } = await supabase
    .from("foods")
    .select("id, nutrition_per_100g")
    .in("id", [...ids]);
  if (error) {
    console.error("[nutrition] fetchFoodsForAggregation failed:", error.message);
    return new Map();
  }
  const map = new Map<string, NutritionPer100g>();
  for (const row of (data ?? []) as { id: string; nutrition_per_100g: NutritionPer100g }[]) {
    map.set(row.id, row.nutrition_per_100g ?? {});
  }
  return map;
}

interface CachedRow {
  summary: NutritionSummary;
  computed_at: string;
  fresh: boolean;
}

/** キャッシュされた月次集計を引く。computed_at から FRESH_HOURS 以内なら fresh=true */
export async function getMonthlySummaryFromCache(
  monthStart: string,
): Promise<CachedRow | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("nutrition_monthly_summaries")
    .select("summary, computed_at")
    .eq("user_id", user.id)
    .eq("month_start", monthStart)
    .maybeSingle();
  if (!data) return null;
  const computedMs = new Date(data.computed_at as string).getTime();
  const ageMs = Date.now() - computedMs;
  const fresh = ageMs < FRESH_HOURS * 60 * 60 * 1000;
  return {
    summary: data.summary as NutritionSummary,
    computed_at: data.computed_at as string,
    fresh,
  };
}
