export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          今月の買い物と食生活のサマリー
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Phase 1 で買物履歴・レシピ提案が有効になります。
        </p>
      </section>
    </div>
  );
}
