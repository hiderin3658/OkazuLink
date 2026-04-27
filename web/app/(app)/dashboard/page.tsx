import Link from "next/link";
import { Plus } from "lucide-react";
import {
  getMonthlySummary,
  listShoppingRecords,
} from "@/lib/shopping/queries";
import { ShoppingRecordCard } from "@/components/shopping/shopping-record-card";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [records, monthly] = await Promise.all([
    listShoppingRecords(5),
    getMonthlySummary(1),
  ]);
  const thisMonth = monthly[0];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          今月の買い物と食生活のサマリー
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h2 className="text-xs text-[var(--color-muted-foreground)]">今月の買物合計</h2>
        {thisMonth ? (
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            ¥{thisMonth.total.toLocaleString()}
            <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
              / {thisMonth.record_count} 回
            </span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            今月の買物履歴はまだありません。
          </p>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">最近の買物</h2>
          <Link
            href="/shopping/new"
            className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs hover:bg-[var(--color-muted)]"
          >
            <Plus size={12} aria-hidden />
            新規登録
          </Link>
        </div>
        {records.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted-foreground)]">
            まだ買物履歴がありません。
          </p>
        ) : (
          <ul className="space-y-2">
            {records.map((rec) => (
              <li key={rec.id}>
                <ShoppingRecordCard record={rec} />
              </li>
            ))}
          </ul>
        )}
        {records.length > 0 && (
          <Link
            href="/shopping"
            className="block text-center text-xs text-[var(--color-primary)] hover:underline"
          >
            買物履歴をすべて見る
          </Link>
        )}
      </section>
    </div>
  );
}
