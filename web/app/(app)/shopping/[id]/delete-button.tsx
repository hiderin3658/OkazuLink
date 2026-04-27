"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteShoppingRecord } from "@/lib/shopping/actions";

export function DeleteShoppingButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm("この買物記録を削除しますか？（明細も同時に削除されます）")) {
      return;
    }
    startTransition(async () => {
      try {
        await deleteShoppingRecord(id);
        // Server Action 内で redirect される
      } catch (err) {
        alert(`削除に失敗しました: ${(err as Error).message}`);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="flex items-center gap-1 rounded-md border border-[var(--color-destructive)] bg-white px-3 py-2 text-sm text-[var(--color-destructive)] hover:bg-[color-mix(in_oklch,var(--color-destructive)_8%,white)] disabled:opacity-50"
    >
      <Trash2 size={14} aria-hidden /> 削除
    </button>
  );
}
