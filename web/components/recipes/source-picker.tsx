"use client";

// レシピ提案ソース（AI / 楽天）切替ラジオ。
//
// 設計書 §6.1 のサンプル UI に従う:
//   提案ソース: ◉ AI ◯ 楽天人気レシピ ⓘ

import { Sparkles, ShoppingBag } from "lucide-react";
import {
  RECIPE_SOURCE_PREFERENCES,
  RECIPE_SOURCE_PREFERENCE_LABEL,
  type RecipeSourcePreference,
} from "@/types/database";

interface Props {
  value: RecipeSourcePreference;
  onChange: (next: RecipeSourcePreference) => void;
}

const ICONS: Record<RecipeSourcePreference, React.ReactNode> = {
  ai: <Sparkles size={14} aria-hidden />,
  rakuten: <ShoppingBag size={14} aria-hidden />,
};

export function SourcePicker({ value, onChange }: Props) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-sm font-semibold">提案ソース</legend>
      <div className="flex flex-wrap gap-1.5">
        {RECIPE_SOURCE_PREFERENCES.map((src) => {
          const selected = src === value;
          return (
            <label
              key={src}
              className={
                "inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-xs transition-colors " +
                (selected
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : "border-[var(--color-border)] bg-white hover:bg-[var(--color-muted)]")
              }
            >
              <input
                type="radio"
                name="recipe-source"
                value={src}
                checked={selected}
                onChange={() => onChange(src)}
                className="sr-only"
              />
              {ICONS[src]}
              <span>{RECIPE_SOURCE_PREFERENCE_LABEL[src]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
