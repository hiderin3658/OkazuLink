import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Flame, Sparkles } from "lucide-react";
import { getRecipe, isRecipeSaved } from "@/lib/recipes/queries";
import { CUISINE_LABEL, type Cuisine } from "@/types/database";
import { SaveToggleButton } from "@/components/recipes/save-toggle-button";

export const dynamic = "force-dynamic";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [recipe, saved] = await Promise.all([
    getRecipe(id),
    isRecipeSaved(id),
  ]);
  if (!recipe) {
    notFound();
  }

  const cuisineLabel =
    CUISINE_LABEL[recipe.cuisine as Cuisine] ?? recipe.cuisine;
  const ingredients = recipe.recipe_ingredients ?? [];
  const required = ingredients.filter((i) => !i.optional);
  const optional = ingredients.filter((i) => i.optional);
  // recipes.steps は jsonb のため、稀に文字列配列以外が入る可能性がある。
  // 配列でない・要素が string でない場合は安全に空にして UI 崩壊を防ぐ。
  const stepsArr = Array.isArray(recipe.steps)
    ? recipe.steps.filter((s): s is string => typeof s === "string")
    : [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <Link
          href="/recipes"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft size={14} aria-hidden />
          レシピ一覧へ戻る
        </Link>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{recipe.title}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
              <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5">
                {cuisineLabel}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock size={12} aria-hidden /> {recipe.time_minutes ?? "?"} 分
              </span>
              {recipe.calories_kcal != null && (
                <span className="inline-flex items-center gap-1">
                  <Flame size={12} aria-hidden /> {recipe.calories_kcal} kcal
                </span>
              )}
              <span>{recipe.servings ?? 1} 人分</span>
              {recipe.source === "ai_generated" && (
                <span className="inline-flex items-center gap-1">
                  <Sparkles size={12} aria-hidden /> AI 生成
                </span>
              )}
            </div>
          </div>
          <SaveToggleButton recipeId={recipe.id} initialSaved={saved} />
        </div>
      </header>

      {recipe.description && (
        <section className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm">
          <p className="whitespace-pre-wrap">{recipe.description}</p>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">材料（{recipe.servings ?? 1} 人分）</h2>
        {ingredients.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-border)] bg-white p-4 text-sm text-[var(--color-muted-foreground)]">
            材料情報が登録されていません。
          </p>
        ) : (
          <ul className="rounded-lg border border-[var(--color-border)] bg-white">
            {required.map((it, idx) => (
              <li
                key={it.id}
                className={
                  "flex items-baseline justify-between px-4 py-2 text-sm" +
                  (idx > 0 ? " border-t border-[var(--color-border)]" : "")
                }
              >
                <span>{it.name}</span>
                <span className="text-[var(--color-muted-foreground)]">
                  {it.amount ?? "適量"}
                </span>
              </li>
            ))}
            {optional.length > 0 && (
              <>
                <li className="border-t border-[var(--color-border)] bg-[var(--color-muted)] px-4 py-1 text-xs text-[var(--color-muted-foreground)]">
                  お好みで
                </li>
                {optional.map((it) => (
                  <li
                    key={it.id}
                    className="flex items-baseline justify-between border-t border-[var(--color-border)] px-4 py-2 text-sm"
                  >
                    <span>{it.name}</span>
                    <span className="text-[var(--color-muted-foreground)]">
                      {it.amount ?? "適量"}
                    </span>
                  </li>
                ))}
              </>
            )}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">作り方</h2>
        {stepsArr.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-border)] bg-white p-4 text-sm text-[var(--color-muted-foreground)]">
            手順情報が登録されていません。
          </p>
        ) : (
          <ol className="rounded-lg border border-[var(--color-border)] bg-white">
            {stepsArr.map((step, idx) => (
              <li
                key={idx}
                className={
                  "flex gap-3 px-4 py-3 text-sm" +
                  (idx > 0 ? " border-t border-[var(--color-border)]" : "")
                }
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-semibold text-[var(--color-primary-foreground)]">
                  {idx + 1}
                </span>
                <span className="whitespace-pre-wrap">{step}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {recipe.source === "ai_generated" && (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          このレシピは AI（Gemini）が生成したものです。安全のため、加熱や食材の取扱いは
          ご自身の判断でお願いします。
        </p>
      )}
    </div>
  );
}
