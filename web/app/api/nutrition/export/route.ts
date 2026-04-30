// 栄養サマリー CSV エクスポートエンドポイント
//
// GET /api/nutrition/export?month=YYYY-MM-01
// → 指定月の nutrition_monthly_summaries を取得して CSV を返す。
//   集計が無い場合は 404、認証なしは 401。

import { createClient } from "@/lib/supabase/server";
import {
  buildNutritionCsv,
  buildNutritionCsvFileName,
} from "@/lib/nutrition/csv";
import type { NutritionSummary } from "@/lib/nutrition/types";

export const dynamic = "force-dynamic";

const MONTH_RE = /^(\d{4})-(\d{2})-01$/;

function parseMonthStart(input: string | null): string | null {
  if (!input) return null;
  const m = MONTH_RE.exec(input);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return input;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const monthStart = parseMonthStart(url.searchParams.get("month"));
  if (!monthStart) {
    return new Response("Invalid month parameter (YYYY-MM-01)", { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data, error } = await supabase
    .from("nutrition_monthly_summaries")
    .select("summary")
    .eq("user_id", user.id)
    .eq("month_start", monthStart)
    .maybeSingle();
  if (error) {
    console.error("[nutrition/export] query failed:", error.message);
    return new Response("Failed to export nutrition summary", { status: 500 });
  }
  if (!data) {
    return new Response("Summary not found for this month", { status: 404 });
  }

  // 推奨摂取量計算で birth_year を引く
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("birth_year")
    .eq("user_id", user.id)
    .maybeSingle();

  const summary = data.summary as NutritionSummary;
  const csv = buildNutritionCsv({
    monthStart,
    birthYear: (profile?.birth_year as number | null) ?? null,
    summary,
  });
  // Excel / Numbers が UTF-8 を正しく認識するよう先頭に BOM (U+FEFF) を付与
  const body = "﻿" + csv;
  const filename = buildNutritionCsvFileName(monthStart);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
