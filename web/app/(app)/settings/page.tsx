import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">設定</h1>
      </header>

      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h2 className="text-sm font-semibold">アカウント</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--color-muted-foreground)]">メール</dt>
            <dd>{user?.email}</dd>
          </div>
        </dl>
        <form action="/api/auth/signout" method="post" className="mt-4">
          <button
            type="submit"
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm transition-colors hover:bg-[var(--color-muted)]"
          >
            ログアウト
          </button>
        </form>
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h2 className="text-sm font-semibold">プロフィール</h2>
        <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
          Phase 2 以降で身長／目標体重／目標タイプ／アレルギー等を入力可能にします。
        </p>
      </section>
    </div>
  );
}
