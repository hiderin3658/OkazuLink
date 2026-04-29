"use server";

// 月次栄養集計の Server Action
//
// recomputeMonthlySummary: 指定月の shopping データを集計して
// nutrition_monthly_summaries に upsert し、結果を返す。

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { aggregateMonthly } from "./aggregate";
import {
  fetchFoodsForAggregation,
  fetchMonthlyShoppingData,
} from "./queries";
import type { NutritionSummary } from "./types";

export type RecomputeResult =
  | { ok: true; summary: NutritionSummary; computed_at: string }
  | { ok: false; message: string };

const MONTH_START_RE = /^\d{4}-\d{2}-01$/;

/** 月初日 (YYYY-MM-01) を受け取り集計し、nutrition_monthly_summaries に upsert する */
export async function recomputeMonthlySummary(
  monthStart: string,
): Promise<RecomputeResult> {
  if (!MONTH_START_RE.test(monthStart)) {
    return { ok: false, message: "month_start は YYYY-MM-01 形式で渡してください" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "認証が必要です。再度ログインしてください。" };
  }

  // 1. 当月の shopping データ + foods をロード
  const { records } = await fetchMonthlyShoppingData(supabase, user.id, monthStart);
  const foods = await fetchFoodsForAggregation(supabase, records);

  // 2. 純粋関数で集計
  const summary = aggregateMonthly(records, foods);

  // 3. nutrition_monthly_summaries に upsert
  const computed_at = new Date().toISOString();
  const { error } = await supabase
    .from("nutrition_monthly_summaries")
    .upsert(
      {
        user_id: user.id,
        month_start: monthStart,
        summary,
        computed_at,
      },
      { onConflict: "user_id,month_start" },
    );
  if (error) {
    console.error("[nutrition] upsert failed:", error.message);
    return { ok: false, message: "栄養サマリーの保存に失敗しました" };
  }

  revalidatePath("/nutrition");
  return { ok: true, summary, computed_at };
}
