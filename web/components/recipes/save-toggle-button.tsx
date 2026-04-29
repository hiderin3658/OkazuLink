"use client";

// お気に入り（saved_recipes）トグルボタン
//
// 初期 saved 状態を Server から受け取り、クリックで Server Action を呼んで
// optimistic に表示を切り替える。

import { useState, useTransition } from "react";
import { Heart, Loader2 } from "lucide-react";
import { toggleSavedRecipe } from "@/lib/recipes/actions";
import { cn } from "@/lib/utils";

interface Props {
  recipeId: string;
  initialSaved: boolean;
}

export function SaveToggleButton({ recipeId, initialSaved }: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    // Optimistic update
    setSaved((prev) => !prev);
    startTransition(async () => {
      const result = await toggleSavedRecipe(recipeId);
      if (!result.ok) {
        // ロールバック
        setSaved((prev) => !prev);
        setError(result.message);
        return;
      }
      setSaved(result.saved);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-pressed={saved}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-50",
          saved
            ? "border-[var(--color-destructive)] bg-[color-mix(in_oklch,var(--color-destructive)_10%,white)] text-[var(--color-destructive)]"
            : "border-[var(--color-border)] bg-white hover:bg-[var(--color-muted)]",
        )}
      >
        {pending ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : (
          <Heart
            size={14}
            className={saved ? "fill-current" : ""}
            aria-hidden
          />
        )}
        {saved ? "お気に入り済" : "お気に入り保存"}
      </button>
      {error && (
        <span className="text-xs text-[var(--color-destructive)]">{error}</span>
      )}
    </div>
  );
}
