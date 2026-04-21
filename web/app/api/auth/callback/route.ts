import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // ホワイトリスト検証
  const { data: allowed } = await supabase
    .from("allowed_users")
    .select("role")
    .eq("email", data.user.email ?? "")
    .maybeSingle();

  if (!allowed) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_allowed`);
  }

  // user_profiles が無ければ初期化
  await supabase
    .from("user_profiles")
    .upsert(
      { user_id: data.user.id, display_name: data.user.user_metadata.full_name ?? null },
      { onConflict: "user_id", ignoreDuplicates: true },
    );

  return NextResponse.redirect(`${origin}/dashboard`);
}
