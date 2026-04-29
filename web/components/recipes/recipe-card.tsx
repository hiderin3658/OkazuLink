// レシピ候補カード（一覧で 1 件分の表示に使う）
//
// クリックで /recipes/[id] へ遷移する。

import Link from "next/link";
import { ChevronRight, Clock, Flame } from "lucide-react";
import { CUISINE_LABEL, type Cuisine } from "@/types/database";

interface Props {
  recipe: {
    id: string;
    title: string;
    cuisine: string;
    description: string;
    servings: number;
    time_minutes: number;
    calories_kcal: number | null;
    ingredients: { name: string; optional: boolean }[];
  };
}

export function RecipeCard({ recipe }: Props) {
  const cuisineLabel =
    CUISINE_LABEL[recipe.cuisine as Cuisine] ?? recipe.cuisine;
  // 必須の食材を先頭から数件表示
  const requiredIngredients = recipe.ingredients
    .filter((i) => !i.optional)
    .slice(0, 4)
    .map((i) => i.name);

  return (
    <Link
      href={`/recipes/${recipe.id}`}
      className="block rounded-lg border border-[var(--color-border)] bg-white p-4 transition-colors hover:bg-[var(--color-muted)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{recipe.title}</h3>
            <span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-xs text-[var(--color-muted-foreground)]">
              {cuisineLabel}
            </span>
          </div>
          {recipe.description && (
            <p className="mt-1 line-clamp-2 text-sm text-[var(--color-muted-foreground)]">
              {recipe.description}
            </p>
          )}
        </div>
        <ChevronRight
          size={18}
          className="mt-1 shrink-0 text-[var(--color-muted-foreground)]"
          aria-hidden
        />
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
        <span className="inline-flex items-center gap-1">
          <Clock size={12} aria-hidden /> {recipe.time_minutes} 分
        </span>
        {recipe.calories_kcal != null && (
          <span className="inline-flex items-center gap-1">
            <Flame size={12} aria-hidden /> {recipe.calories_kcal} kcal
          </span>
        )}
        <span>{recipe.servings} 人分</span>
      </div>

      {requiredIngredients.length > 0 && (
        <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
          材料: {requiredIngredients.join(", ")}
          {recipe.ingredients.length > requiredIngredients.length && " ほか"}
        </p>
      )}
    </Link>
  );
}
