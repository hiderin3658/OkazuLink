// レシピ関連の Server Component 向けデータ取得ヘルパー
//
// 全 authenticated user に read 開放されているため（recipes / recipe_ingredients
// 両方 RLS で `to authenticated using (true)` ）、JWT があれば誰でも読める。
// saved_recipes は self-only。

import { createClient } from "@/lib/supabase/server";
import type { RecipeWithIngredients } from "@/types/database";

/** 単一レシピと材料を取得。存在しなければ null */
export async function getRecipe(id: string): Promise<RecipeWithIngredients | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recipes")
    .select("*, recipe_ingredients(*)")
    .eq("id", id)
    .maybeSingle();
  return (data as RecipeWithIngredients | null) ?? null;
}

/** 当該 recipe を現在のユーザーがお気に入り保存しているか */
export async function isRecipeSaved(recipeId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("saved_recipes")
    .select("id")
    .eq("recipe_id", recipeId)
    .eq("user_id", user.id)
    .maybeSingle();
  return !!data;
}
