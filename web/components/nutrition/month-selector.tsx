// 月選択チップ。直近 N ヶ月を chip 形式で並べ、URL の ?month= を切り替える。
//
// Server Component（Link で <a> をレンダ）。

import Link from "next/link";
import { cn } from "@/lib/utils";

interface Props {
  /** 現在選択中の月初日（YYYY-MM-01） */
  selected: string;
  /** 表示するチップ件数 */
  monthsBack?: number;
  /** 「今」起点。テスト用に上書き可能 */
  now?: Date;
}

export function MonthSelector({ selected, monthsBack = 6, now }: Props) {
  const months = generateRecentMonths(monthsBack, now);
  return (
    <div className="flex flex-wrap gap-1.5">
      {months.map((m) => {
        const active = m.value === selected;
        return (
          <Link
            key={m.value}
            href={{ pathname: "/nutrition", query: { month: m.value } }}
            aria-pressed={active}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs transition-colors",
              active
                ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                : "border-[var(--color-border)] bg-white hover:bg-[var(--color-muted)]",
            )}
          >
            {m.label}
          </Link>
        );
      })}
    </div>
  );
}

/** 「今」基準で過去 N ヶ月の月初日を新しい順に返す（"YYYY-MM-01"） */
function generateRecentMonths(
  count: number,
  now: Date = new Date(),
): { value: string; label: string }[] {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const baseY = jst.getUTCFullYear();
  const baseM = jst.getUTCMonth(); // 0..11
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const totalMonth = baseY * 12 + baseM - i;
    const y = Math.floor(totalMonth / 12);
    const m = totalMonth % 12;
    const monthStart = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const label = `${y}年${m + 1}月`;
    out.push({ value: monthStart, label });
  }
  return out;
}
