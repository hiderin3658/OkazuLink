import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listSavedRecipes } from "@/lib/recipes/saved-queries";
import { RecipeCard } from "@/components/recipes/recipe-card";

export const dynamic = "force-dynamic";

export default async function SavedRecipesPage() {
  const saved = await listSavedRecipes(100);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/recipes"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft size={14} aria-hidden />
          レシピ提案へ戻る
        </Link>
        <h1 className="text-2xl font-bold">お気に入りレシピ</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          保存したレシピは何度でも確認できます（{saved.length} 件）
        </p>
      </header>

      {saved.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-white p-6 text-center text-sm text-[var(--color-muted-foreground)]">
          まだお気に入りに登録されたレシピがありません。<br />
          <Link
            href="/recipes"
            className="text-[var(--color-primary)] underline-offset-2 hover:underline"
          >
            レシピ提案
          </Link>
          {" "}から気になる候補を保存してみてください。
        </div>
      ) : (
        <ul className="space-y-2">
          {saved.map((row) => (
            <li key={row.id}>
              <RecipeCard
                recipe={{
                  id: row.recipe.id,
                  title: row.recipe.title,
                  cuisine: row.recipe.cuisine,
                  description: row.recipe.description ?? "",
                  servings: row.recipe.servings ?? 1,
                  time_minutes: row.recipe.time_minutes ?? 30,
                  calories_kcal: row.recipe.calories_kcal,
                  ingredients: (row.recipe.recipe_ingredients ?? []).map((ri) => ({
                    name: ri.name,
                    optional: ri.optional,
                  })),
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
