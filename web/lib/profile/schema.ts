// ユーザープロフィールフォームの Zod スキーマ
//
// Phase 1 では allergies / disliked_foods / goal_type のみ対応。
// 体重・身長等は Phase 2 以降で拡張予定。

import { z } from "zod";
import { GOAL_TYPES } from "@/types/database";

const TAG_RE = /^[^\s,]/; // 非空白・非カンマ始まり
const MAX_TAG_LEN = 30;
const MAX_TAG_COUNT = 30;

const tagListSchema = z
  .array(
    z
      .string()
      .trim()
      .min(1, "空のタグは追加できません")
      .max(MAX_TAG_LEN, `1 タグは ${MAX_TAG_LEN} 文字以内`)
      .regex(TAG_RE, "空白で始めることはできません"),
  )
  .max(MAX_TAG_COUNT, `タグは最大 ${MAX_TAG_COUNT} 件`)
  .default([]);

export const userProfileInputSchema = z.object({
  display_name: z
    .string()
    .trim()
    .max(50, "表示名は 50 文字以内")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  // フォームでは「未設定」を空文字 "" で送ってくるため許容。enum 値以外は null 化
  goal_type: z
    .union([z.enum(GOAL_TYPES), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v == null ? null : v)),
  allergies: tagListSchema,
  disliked_foods: tagListSchema,
});

export type UserProfileInput = z.input<typeof userProfileInputSchema>;
export type UserProfileParsed = z.output<typeof userProfileInputSchema>;
