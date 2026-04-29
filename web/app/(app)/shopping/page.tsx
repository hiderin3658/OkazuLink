import Link from "next/link";
import { Download, Plus } from "lucide-react";
import {
  getMonthlySummary,
  listShoppingRecords,
} from "@/lib/shopping/queries";
import { ShoppingRecordCard } from "@/components/shopping/shopping-record-card";
import { ShoppingMonthlySummary } from "@/components/shopping/shopping-monthly-summary";

export const dynamic = "force-dynamic";

export default async function ShoppingPage() {
  const [records, monthly] = await Promise.all([
    listShoppingRecords(50),
    getMonthlySummary(6),
  ]);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">買物</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            購入履歴と月別合計
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {records.length > 0 && (
            <a
              href="/api/shopping/export"
              download
              className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm hover:bg-[var(--color-muted)]"
              aria-label="買物履歴を CSV でダウンロード"
            >
              <Download size={14} aria-hidden />
              CSV
            </a>
          )}
          <Link
            href="/shopping/new"
            className="flex items-center gap-1 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-medium text-[var(--color-primary-foreground)]"
          >
            <Plus size={16} aria-hidden />
            新規登録
          </Link>
        </div>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">月別合計</h2>
        <ShoppingMonthlySummary rows={monthly} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">最近の買い物</h2>
        {records.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted-foreground)]">
            まだ買物履歴がありません。「新規登録」から追加してください。
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
      </section>
    </div>
  );
}
