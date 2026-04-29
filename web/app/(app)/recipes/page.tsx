import Link from "next/link";
import { Heart } from "lucide-react";
import { getRecentIngredientNames } from "@/lib/shopping/queries";
import { getMyProfile } from "@/lib/profile/queries";
import { RecipeSuggestForm } from "@/components/recipes/recipe-suggest-form";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const [recent, profile] = await Promise.all([
    getRecentIngredientNames(30),
    getMyProfile(),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">レシピ提案</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            手持ちの食材とジャンルから AI がレシピを提案します
          </p>
        </div>
        <Link
          href="/recipes/saved"
          className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm hover:bg-[var(--color-muted)]"
        >
          <Heart size={14} aria-hidden /> お気に入り
        </Link>
      </header>

      {recent.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-white p-6 text-center text-sm text-[var(--color-muted-foreground)]">
          まずは買物を登録してください。登録した食材から候補を作ります。
        </div>
      ) : null}

      <RecipeSuggestForm
        recentIngredients={recent}
        profile={
          profile
            ? {
                allergies: profile.allergies,
                disliked: profile.disliked_foods,
                goal_type: profile.goal_type,
              }
            : undefined
        }
      />
    </div>
  );
}
