import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: me } = await supabase
    .from("allowed_users")
    .select("role")
    .eq("email", user?.email ?? "")
    .maybeSingle();

  if (me?.role !== "admin") {
    redirect("/dashboard");
  }

  const { data: allowedUsers } = await supabase
    .from("allowed_users")
    .select("id, email, role, created_at")
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">管理</h1>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          許可されたユーザーの一覧
        </p>
      </header>

      <section className="rounded-lg border border-[var(--color-border)] bg-white">
        <ul className="divide-y divide-[var(--color-border)]">
          {allowedUsers?.map((u) => (
            <li key={u.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>{u.email}</span>
              <span className="rounded bg-[var(--color-muted)] px-2 py-0.5 text-xs">
                {u.role}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-xs text-[var(--color-muted-foreground)]">
        ユーザー追加／削除機能は Phase 0 後半で追加予定。現状は Supabase コンソールまたは SQL で `allowed_users` テーブルに直接追加してください。
      </p>
    </div>
  );
}
