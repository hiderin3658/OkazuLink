// 月別サマリーの簡易表示（数値のみ。Phase 2 でグラフ化検討）

type MonthlyRow = {
  year_month: string;
  total: number;
  record_count: number;
};

export function ShoppingMonthlySummary({ rows }: { rows: MonthlyRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        買物履歴がまだありません。
      </p>
    );
  }

  return (
    <ul className="rounded-lg border border-[var(--color-border)] bg-white">
      {rows.map((row, idx) => (
        <li
          key={row.year_month}
          className={
            "flex items-baseline justify-between px-4 py-3 text-sm" +
            (idx > 0 ? " border-t border-[var(--color-border)]" : "")
          }
        >
          <div>
            <span className="font-medium">{labelOf(row.year_month)}</span>
            <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
              {row.record_count} 回
            </span>
          </div>
          <span className="font-semibold tabular-nums">
            ¥{row.total.toLocaleString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

function labelOf(yyyyMm: string): string {
  const [y, m] = yyyyMm.split("-");
  return `${y}年${Number(m)}月`;
}
