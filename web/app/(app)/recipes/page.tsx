import { getRecentIngredientNames } from "@/lib/shopping/queries";
import { RecipeSuggestForm } from "@/components/recipes/recipe-suggest-form";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const recent = await getRecentIngredientNames(30);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">レシピ提案</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          手持ちの食材とジャンルから AI がレシピを提案します
        </p>
      </header>

      {recent.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-white p-6 text-center text-sm text-[var(--color-muted-foreground)]">
          まずは買物を登録してください。登録した食材から候補を作ります。
        </div>
      ) : null}

      <RecipeSuggestForm recentIngredients={recent} />
    </div>
  );
}
