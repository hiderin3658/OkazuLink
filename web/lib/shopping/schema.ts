// 買物登録フォームの Zod スキーマ
//
// クライアント側の即時バリデーションと Server Action での再検証の両方で使う。
// DB スキーマ（supabase/migrations/20260421000002_phase1_shopping_recipes.sql）と
// 整合させること。

import { z } from "zod";
import { FOOD_CATEGORIES } from "@/types/database";

// 0 以上の整数（円・個数等の集計用）。空文字は 0、未入力（undefined）は許容
const nonNegInt = z
  .union([z.number(), z.string()])
  .transform((v) => {
    if (typeof v === "number") return v;
    if (v === "" || v === null || v === undefined) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  })
  .pipe(z.number().int("整数で入力してください").nonnegative("0 以上で入力してください"));

// 数量（小数 3 桁まで許容）。空文字は null
const quantityField = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) => {
    if (v === null || v === "" || v === undefined) return null;
    if (typeof v === "number") return v;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  })
  .pipe(z.number().nonnegative("0 以上で入力してください").nullable());

export const shoppingItemInputSchema = z.object({
  raw_name: z.string().trim().min(1, "食材名は必須です").max(100, "食材名は 100 文字以内"),
  display_name: z
    .string()
    .trim()
    .max(100, "表示名は 100 文字以内")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  category: z.enum(FOOD_CATEGORIES).default("other"),
  quantity: quantityField.default(null),
  unit: z
    .string()
    .trim()
    .max(20, "単位は 20 文字以内")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  unit_price: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      if (v === null || v === "" || v === undefined) return null;
      if (typeof v === "number") return v;
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    })
    .pipe(z.number().int().nonnegative().nullable()),
  total_price: nonNegInt.default(0),
  discount: nonNegInt.default(0),
});

export const shoppingRecordInputSchema = z.object({
  purchased_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "日付は YYYY-MM-DD の形式"),
  store_name: z
    .string()
    .trim()
    .max(100, "店舗名は 100 文字以内")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  total_amount: nonNegInt.default(0),
  note: z
    .string()
    .trim()
    .max(500, "メモは 500 文字以内")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  source_type: z.enum(["receipt", "manual"]).default("manual"),
  items: z
    .array(shoppingItemInputSchema)
    .min(1, "食材を 1 つ以上追加してください")
    .max(100, "食材は最大 100 件まで"),
});

export type ShoppingItemInput = z.input<typeof shoppingItemInputSchema>;
export type ShoppingItemParsed = z.output<typeof shoppingItemInputSchema>;
export type ShoppingRecordInput = z.input<typeof shoppingRecordInputSchema>;
export type ShoppingRecordParsed = z.output<typeof shoppingRecordInputSchema>;

/** items から total_amount を再計算する（クライアント表示・サーバ補正の両方で利用） */
export function calcTotalAmount(items: Pick<ShoppingItemParsed, "total_price" | "discount">[]): number {
  return items.reduce((sum, it) => sum + (it.total_price ?? 0) - (it.discount ?? 0), 0);
}

/** 空の item 行のテンプレート */
export const emptyItem: ShoppingItemInput = {
  raw_name: "",
  display_name: "",
  category: "other",
  quantity: null,
  unit: "",
  unit_price: null,
  total_price: 0,
  discount: 0,
};
