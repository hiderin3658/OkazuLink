import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/layout/bottom-nav";
import { SideNav } from "@/components/layout/side-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: allowed } = await supabase
    .from("allowed_users")
    .select("role")
    .eq("email", user.email ?? "")
    .maybeSingle();

  if (!allowed) {
    await supabase.auth.signOut();
    redirect("/login?error=not_allowed");
  }

  const isAdmin = allowed.role === "admin";

  return (
    <div className="flex min-h-svh">
      <SideNav isAdmin={isAdmin} />
      <main className="flex-1 pb-20 md:pb-0">
        <div className="mx-auto max-w-2xl px-4 py-6 md:px-6 md:py-8">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
