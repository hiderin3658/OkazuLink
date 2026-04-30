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

  const {
    display_name,
    goal_type,
    allergies,
    disliked_foods,
    birth_year,
    height_cm,
    target_weight_kg,
  } = parsed.data;
  // Phase 2 で birth_year / height_cm / target_weight_kg を追加。
  // Supabase の upsert は ON CONFLICT DO UPDATE 時に提供されたキーのみ SET するため、
  // 将来追加されるフィールド（例: 体組成計連携）は別 Action で扱う設計とする。
  const { error } = await supabase
    .from("user_profiles")
    .upsert(
      {
        user_id: user.id,
        display_name,
        goal_type,
        allergies,
        disliked_foods,
        birth_year,
        height_cm,
        target_weight_kg,
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
  // 推奨摂取量計算は profile.birth_year に依存するため /nutrition も再検証
  revalidatePath("/nutrition");
  return { ok: true };
}
