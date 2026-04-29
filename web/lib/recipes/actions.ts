"use server";

// レシピ関連の Server Actions
//
// - toggleSavedRecipe: saved_recipes を upsert/delete（お気に入りトグル）

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ToggleResult =
  | { ok: true; saved: boolean }
  | { ok: false; message: string };

/** お気に入り状態を切り替える（保存されていれば削除、なければ追加） */
export async function toggleSavedRecipe(recipeId: string): Promise<ToggleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "認証が必要です。再度ログインしてください。" };
  }

  // 既存判定
  const { data: existing, error: selErr } = await supabase
    .from("saved_recipes")
    .select("id")
    .eq("recipe_id", recipeId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (selErr) {
    console.error("[recipes] saved lookup failed:", selErr);
    return { ok: false, message: "状態の取得に失敗しました" };
  }

  if (existing) {
    const { error: delErr } = await supabase
      .from("saved_recipes")
      .delete()
      .eq("id", existing.id);
    if (delErr) {
      console.error("[recipes] unsave failed:", delErr);
      return { ok: false, message: "お気に入り解除に失敗しました" };
    }
    revalidatePath(`/recipes/${recipeId}`);
    return { ok: true, saved: false };
  }

  const { error: insErr } = await supabase
    .from("saved_recipes")
    .insert({ user_id: user.id, recipe_id: recipeId });
  if (insErr) {
    console.error("[recipes] save failed:", insErr);
    return { ok: false, message: "お気に入り保存に失敗しました" };
  }
  revalidatePath(`/recipes/${recipeId}`);
  return { ok: true, saved: true };
}
