// user_profiles 取得（自分のもののみ、RLS で守られている）

import { createClient } from "@/lib/supabase/server";
import type { UserProfile } from "@/types/database";

/** 現在のユーザーのプロフィール。未作成なら null（OAuth コールバックで自動 upsert される想定） */
export async function getMyProfile(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  return (data as UserProfile | null) ?? null;
}
