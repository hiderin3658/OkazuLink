// ユーザープロフィールフォームの Zod スキーマ
//
// Phase 1 で allergies / disliked_foods / goal_type、
// Phase 2 で birth_year / height_cm / target_weight_kg を追加。
// 性別は当面「女性」固定（プロジェクトターゲット）。

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

/** 数値 / 数値文字列 / 空文字 / null を受け取り、数値または null に正規化する。
 *  optional で undefined のときも null を返す（DB の NULL と整合）。 */
function nullableNumberField(opts: {
  min?: number;
  max?: number;
  int?: boolean;
  fieldLabel: string;
}) {
  return z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === undefined || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : NaN;
    })
    .pipe(
      z
        .number({
          invalid_type_error: `${opts.fieldLabel}は数値で入力してください`,
        })
        .refine(
          (n) => !opts.int || Number.isInteger(n),
          `${opts.fieldLabel}は整数で入力してください`,
        )
        .refine(
          (n) => opts.min === undefined || n >= opts.min,
          `${opts.fieldLabel}は ${opts.min} 以上で入力してください`,
        )
        .refine(
          (n) => opts.max === undefined || n <= opts.max,
          `${opts.fieldLabel}は ${opts.max} 以下で入力してください`,
        )
        .nullable(),
    );
}

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
  // Phase 2 追加
  birth_year: nullableNumberField({
    min: 1900,
    max: new Date().getFullYear(),
    int: true,
    fieldLabel: "生年",
  }),
  height_cm: nullableNumberField({
    min: 50,
    max: 250,
    fieldLabel: "身長",
  }),
  target_weight_kg: nullableNumberField({
    min: 20,
    max: 300,
    fieldLabel: "目標体重",
  }),
});

export type UserProfileInput = z.input<typeof userProfileInputSchema>;
export type UserProfileParsed = z.output<typeof userProfileInputSchema>;
