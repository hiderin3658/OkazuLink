"use client";

// 月次集計を再計算する Server Action 呼出ボタン。

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { recomputeMonthlySummary } from "@/lib/nutrition/actions";

interface Props {
  monthStart: string;
  /** 表示用ラベル（"再計算" / "計算開始" 等） */
  label?: string;
}

export function RecomputeButton({ monthStart, label = "再計算" }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await recomputeMonthlySummary(monthStart);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm hover:bg-[var(--color-muted)] disabled:opacity-50"
      >
        {pending ? (
          <Loader2 size={14} className="animate-spin" aria-hidden />
        ) : (
          <RefreshCw size={14} aria-hidden />
        )}
        {pending ? "計算中..." : label}
      </button>
      {error && (
        <span role="alert" className="text-xs text-[var(--color-destructive)]">
          {error}
        </span>
      )}
    </div>
  );
}
