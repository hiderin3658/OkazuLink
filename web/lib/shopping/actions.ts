"use server";

// 買物登録の Server Actions
//
// クライアント側のフォームから直接呼び出される（"use server" マーカー）。
// 受け取った値は Zod で再検証してから DB に書き込む（クライアント信用しない）。

import type { SupabaseClient, User } from "@supabase/supabase-js";
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

/** ユーザー向けの汎用エラーメッセージ。DB エラー詳細は console.error に流す。 */
const GENERIC_SAVE_ERR = "保存に失敗しました。少し時間をおいて再度お試しください。";
const GENERIC_DELETE_ERR = "削除に失敗しました。少し時間をおいて再度お試しください。";
const NOT_FOUND_ERR = "対象の記録が見つかりません。";

function flattenZodErrors(
  fieldErrors: Record<string, string[] | undefined>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(fieldErrors)) {
    if (v && v.length > 0) out[k] = v;
  }
  return out;
}

/** 認証ユーザーを取得し、未ログインなら ShoppingActionState で返却 */
async function requireUser(
  supabase: SupabaseClient,
): Promise<{ ok: true; user: User } | { ok: false; state: ShoppingActionState }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      state: { ok: false, message: "認証が必要です。再度ログインしてください。" },
    };
  }
  return { ok: true, user };
}

/** 対象 shopping_record が現在のユーザー所有か確認する */
async function assertOwnsRecord(
  supabase: SupabaseClient,
  recordId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; state: ShoppingActionState }> {
  const { data, error } = await supabase
    .from("shopping_records")
    .select("user_id")
    .eq("id", recordId)
    .maybeSingle();
  if (error) {
    console.error("[shopping] ownership check failed:", error);
    return { ok: false, state: { ok: false, message: GENERIC_SAVE_ERR } };
  }
  if (!data) {
    return { ok: false, state: { ok: false, message: NOT_FOUND_ERR } };
  }
  if (data.user_id !== userId) {
    // RLS でも防御済みだが、Server Action 側で先に弾くことで具体的な
    // エラーメッセージを返し、不審なアクセス試行を console.warn で検知する
    console.warn("[shopping] cross-user access attempt:", {
      recordId,
      requesterId: userId,
    });
    return { ok: false, state: { ok: false, message: NOT_FOUND_ERR } };
  }
  return { ok: true };
}

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
      fieldErrors: flattenZodErrors(parsed.error.flatten().fieldErrors),
    };
  }

  const { items, ...record } = parsed.data;
  const total_amount =
    record.total_amount > 0 ? record.total_amount : calcTotalAmount(items);

  const supabase = await createClient();
  const userResult = await requireUser(supabase);
  if (!userResult.ok) return userResult.state;

  const { data: rec, error: recErr } = await supabase
    .from("shopping_records")
    .insert({
      ...record,
      total_amount,
      user_id: userResult.user.id,
    })
    .select("id")
    .single();
  if (recErr || !rec) {
    console.error("[shopping] insert record failed:", recErr);
    return { ok: false, message: GENERIC_SAVE_ERR };
  }

  const itemRows = items.map((it) => ({ ...it, shopping_record_id: rec.id }));
  const { error: itemErr } = await supabase
    .from("shopping_items")
    .insert(itemRows);
  if (itemErr) {
    // ベストエフォートなロールバック（Supabase JS には DB トランザクションが
    // 直接出ないため、明細 INSERT 失敗時に親を削除して整合させる）
    console.error("[shopping] insert items failed, rolling back record:", itemErr);
    await supabase.from("shopping_records").delete().eq("id", rec.id);
    return { ok: false, message: GENERIC_SAVE_ERR };
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
      fieldErrors: flattenZodErrors(parsed.error.flatten().fieldErrors),
    };
  }

  const supabase = await createClient();
  const userResult = await requireUser(supabase);
  if (!userResult.ok) return userResult.state;

  const ownership = await assertOwnsRecord(supabase, id, userResult.user.id);
  if (!ownership.ok) return ownership.state;

  const { items, ...record } = parsed.data;
  const total_amount =
    record.total_amount > 0 ? record.total_amount : calcTotalAmount(items);

  // 明細は ID 紐付けが複雑になるため、一旦全削除して INSERT する。
  // 件数 < 100 なので問題なし。Phase 2 で diff 適用へ最適化検討。
  // Supabase JS には DB トランザクションが直接出ないため、stored function
  // 化が必要になったら Phase 2 で対応する（今はベストエフォート）。
  const { error: delErr } = await supabase
    .from("shopping_items")
    .delete()
    .eq("shopping_record_id", id);
  if (delErr) {
    console.error("[shopping] delete items failed:", delErr);
    return { ok: false, message: GENERIC_SAVE_ERR };
  }

  const { error: updErr } = await supabase
    .from("shopping_records")
    .update({ ...record, total_amount })
    .eq("id", id);
  if (updErr) {
    console.error("[shopping] update record failed:", updErr);
    return { ok: false, message: GENERIC_SAVE_ERR };
  }

  const itemRows = items.map((it) => ({ ...it, shopping_record_id: id }));
  const { error: insErr } = await supabase
    .from("shopping_items")
    .insert(itemRows);
  if (insErr) {
    console.error("[shopping] re-insert items failed:", insErr);
    return { ok: false, message: GENERIC_SAVE_ERR };
  }

  revalidatePath("/shopping");
  revalidatePath(`/shopping/${id}`);
  revalidatePath("/dashboard");
  return { ok: true, id };
}

/** 買物記録を削除（明細は CASCADE で自動削除される） */
export async function deleteShoppingRecord(id: string): Promise<void> {
  const supabase = await createClient();
  const userResult = await requireUser(supabase);
  if (!userResult.ok) {
    throw new Error(userResult.state?.ok === false ? userResult.state.message : "認証が必要です");
  }

  const ownership = await assertOwnsRecord(supabase, id, userResult.user.id);
  if (!ownership.ok) {
    const msg = ownership.state?.ok === false ? ownership.state.message : NOT_FOUND_ERR;
    throw new Error(msg);
  }

  const { error } = await supabase.from("shopping_records").delete().eq("id", id);
  if (error) {
    console.error("[shopping] delete record failed:", error);
    throw new Error(GENERIC_DELETE_ERR);
  }
  revalidatePath("/shopping");
  revalidatePath("/dashboard");
  redirect("/shopping");
}
