"use server";

// 買物登録の Server Actions
//
// クライアント側のフォームから直接呼び出される（"use server" マーカー）。
// 受け取った値は Zod で再検証してから DB に書き込む（クライアント信用しない）。

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  calcTotalAmount,
  shoppingRecordInputSchema,
  type ShoppingRecordInput,
} from "./schema";

export type ShoppingActionState =
  | { ok: true; id: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> }
  | null;

/** 買物記録 + 明細をまとめて新規作成 */
export async function createShoppingRecord(
  _prev: ShoppingActionState,
  input: ShoppingRecordInput,
): Promise<ShoppingActionState> {
  const parsed = shoppingRecordInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "入力に誤りがあります",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { items, ...record } = parsed.data;

  // 合計金額が未入力なら items から再計算する
  const total_amount =
    record.total_amount > 0 ? record.total_amount : calcTotalAmount(items);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "認証が必要です。再度ログインしてください。" };
  }

  const { data: rec, error: recErr } = await supabase
    .from("shopping_records")
    .insert({
      ...record,
      total_amount,
      user_id: user.id,
    })
    .select("id")
    .single();
  if (recErr || !rec) {
    return { ok: false, message: recErr?.message ?? "保存に失敗しました" };
  }

  const itemRows = items.map((it) => ({
    ...it,
    shopping_record_id: rec.id,
  }));
  const { error: itemErr } = await supabase
    .from("shopping_items")
    .insert(itemRows);
  if (itemErr) {
    // ロールバック: 親レコードを削除
    await supabase.from("shopping_records").delete().eq("id", rec.id);
    return { ok: false, message: itemErr.message };
  }

  revalidatePath("/shopping");
  revalidatePath("/dashboard");
  return { ok: true, id: rec.id };
}

/** 買物記録 + 明細を更新（明細は一度全削除して再 INSERT する単純実装） */
export async function updateShoppingRecord(
  id: string,
  _prev: ShoppingActionState,
  input: ShoppingRecordInput,
): Promise<ShoppingActionState> {
  const parsed = shoppingRecordInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "入力に誤りがあります",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const { items, ...record } = parsed.data;
  const total_amount =
    record.total_amount > 0 ? record.total_amount : calcTotalAmount(items);

  const supabase = await createClient();

  const { error: updErr } = await supabase
    .from("shopping_records")
    .update({ ...record, total_amount })
    .eq("id", id);
  if (updErr) return { ok: false, message: updErr.message };

  // 明細は ID 紐付けが複雑になるため、一旦全削除して INSERT する
  // 件数 < 100 なので問題なし。Phase 2 で diff 適用に最適化検討
  const { error: delErr } = await supabase
    .from("shopping_items")
    .delete()
    .eq("shopping_record_id", id);
  if (delErr) return { ok: false, message: delErr.message };

  const itemRows = items.map((it) => ({ ...it, shopping_record_id: id }));
  const { error: insErr } = await supabase
    .from("shopping_items")
    .insert(itemRows);
  if (insErr) return { ok: false, message: insErr.message };

  revalidatePath("/shopping");
  revalidatePath(`/shopping/${id}`);
  revalidatePath("/dashboard");
  return { ok: true, id };
}

/** 買物記録を削除（明細は CASCADE で自動削除される） */
export async function deleteShoppingRecord(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("shopping_records").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
  revalidatePath("/shopping");
  revalidatePath("/dashboard");
  redirect("/shopping");
}
