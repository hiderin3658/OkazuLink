// 買物履歴 CSV エクスポートエンドポイント
//
// GET /api/shopping/export
// → ログインユーザーの全 shopping_records + shopping_items を結合した CSV を返す。
//   RLS で守られているため、自分のデータのみ取得される。

import { createClient } from "@/lib/supabase/server";
import {
  buildCsvFileName,
  buildShoppingCsv,
} from "@/lib/shopping/csv";
import type { ShoppingRecordWithItems } from "@/types/database";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data, error } = await supabase
    .from("shopping_records")
    .select("*, shopping_items(*)")
    .order("purchased_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[shopping/export] query failed:", error);
    return new Response("Failed to query shopping records", { status: 500 });
  }

  const records = (data ?? []) as ShoppingRecordWithItems[];
  const csv = buildShoppingCsv(records);
  // Excel / Numbers が UTF-8 を正しく認識するよう先頭に BOM (U+FEFF) を付与
  const body = "﻿" + csv;
  const filename = buildCsvFileName();

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
