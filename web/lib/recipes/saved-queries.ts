// お気に入りレシピ一覧の取得
//
// saved_recipes は self-only RLS なので、現在のユーザー分だけ返る。
// recipes / recipe_ingredients は read-for-authenticated。

import { createClient } from "@/lib/supabase/server";
import type {
  RecipeIngredient,
  Recipe as RecipeRow,
} from "@/types/database";

export interface SavedRecipeRow {
  id: string; // saved_recipes.id
  saved_at: string; // saved_recipes.created_at
  note: string | null;
  recipe: RecipeRow & { recipe_ingredients: RecipeIngredient[] };
}

export async function listSavedRecipes(limit = 100): Promise<SavedRecipeRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("saved_recipes")
    .select(
      "id, note, created_at, recipes(id, title, cuisine, description, servings, time_minutes, calories_kcal, steps, source, generated_prompt_hash, created_at, recipe_ingredients(id, recipe_id, food_id, name, amount, optional))",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (!data) return [];

  // Supabase の nested select は relation の cardinality によって object / array
  // どちらでも返り得るため、unknown 経由で柔軟にハンドリングする。
  // saved_recipes.recipe_id は recipes.id への FK で一意制約があるため、
  // array で来た場合も常に長さ 1 という前提で先頭要素を採用する。
  type RecipeShape = SavedRecipeRow["recipe"];
  type RawRow = {
    id: string;
    note: string | null;
    created_at: string;
    recipes: RecipeShape | RecipeShape[] | null;
  };
  return (data as unknown as RawRow[]).flatMap((r) => {
    const rec = Array.isArray(r.recipes) ? r.recipes[0] : r.recipes;
    if (!rec) return [];
    return [
      {
        id: r.id,
        saved_at: r.created_at,
        note: r.note,
        recipe: rec,
      },
    ];
  });
}
