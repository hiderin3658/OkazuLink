"use client";

import { CUISINES, CUISINE_LABEL, type Cuisine } from "@/types/database";
import { cn } from "@/lib/utils";

interface Props {
  value: Cuisine;
  onChange: (next: Cuisine) => void;
}

export function CuisinePicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {CUISINES.map((c) => {
        const active = value === c;
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            aria-pressed={active}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition-colors",
              active
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "border-[var(--color-border)] bg-white hover:bg-[var(--color-muted)]",
            )}
          >
            {CUISINE_LABEL[c]}
          </button>
        );
      })}
    </div>
  );
}
