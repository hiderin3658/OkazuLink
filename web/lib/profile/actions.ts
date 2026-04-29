"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  userProfileInputSchema,
  type UserProfileInput,
} from "./schema";

export type ProfileActionResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export async function updateMyProfile(
  _prev: ProfileActionResult | null,
  input: UserProfileInput,
): Promise<ProfileActionResult> {
  const parsed = userProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "入力に誤りがあります",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "認証が必要です。再度ログインしてください。" };
  }

  const { display_name, goal_type, allergies, disliked_foods } = parsed.data;
  // Note: Supabase の upsert は ON CONFLICT DO UPDATE 時に提供されたキーのみを
  // SET する仕様のため、本関数で送らない birth_year / height_cm /
  // target_weight_kg 等は既存値が維持される。Phase 2 でそれらの編集 UI を
  // 追加する際は、本関数とは別の Action で個別に更新する設計を推奨。
  const { error } = await supabase
    .from("user_profiles")
    .upsert(
      {
        user_id: user.id,
        display_name,
        goal_type,
        allergies,
        disliked_foods,
      },
      { onConflict: "user_id" },
    );
  if (error) {
    console.error("[profile] upsert failed:", error);
    return {
      ok: false,
      message: "プロフィールの保存に失敗しました。少し時間をおいて再度お試しください。",
    };
  }

  revalidatePath("/settings");
  revalidatePath("/recipes");
  return { ok: true };
}
