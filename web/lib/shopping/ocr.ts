// extract-receipt Edge Function の出力 (OcrResult) を、ShoppingForm が
// プリフィルできる ShoppingRecordInput に変換する。
//
// 純粋関数。クライアントコンポーネント・テストの両方で利用する。

import type { FoodCategory, ShoppingSource } from "@/types/database";
import type { ShoppingItemInput, ShoppingRecordInput } from "./schema";

/** extract-receipt のレスポンス形（types.ts と整合させる） */
export interface OcrItem {
  raw_name: string;
  quantity: number | null;
  unit: string | null;
  total_price: number;
  category: string;
}

export interface OcrResult {
  store_name: string | null;
  purchased_at: string;
  total_amount: number;
  items: OcrItem[];
  discounts: { label: string; amount: number }[];
  confidence: number;
}

const VALID_CATEGORIES: ReadonlySet<FoodCategory> = new Set([
  "vegetable",
  "meat",
  "fish",
  "dairy",
  "grain",
  "seasoning",
  "beverage",
  "sweet",
  "fruit",
  "egg",
  "other",
]);

function safeCategory(c: string): FoodCategory {
  return VALID_CATEGORIES.has(c as FoodCategory) ? (c as FoodCategory) : "other";
}

/** OcrResult → ShoppingRecordInput
 *
 *  - source_type は "receipt" 固定
 *  - image_paths は呼出側で 1 件以上を渡してくる前提
 *  - discounts の扱い:
 *    - 各 item.discount = 0 で初期化（プロラタ配賦は不確かなため避ける）
 *    - レシート全体の値引きは note フィールドに転記（運用情報として保持）
 *    - total_amount は OCR が返した「値引き後合計」をそのまま採用
 *    - ユーザーは編集画面で個別に discount を調整可能
 */
export function ocrToShoppingInput(
  ocr: OcrResult,
  imagePaths: string[],
): ShoppingRecordInput {
  const items: ShoppingItemInput[] = ocr.items.map((it) => ({
    raw_name: it.raw_name,
    display_name: "",
    category: safeCategory(it.category),
    quantity: it.quantity,
    unit: it.unit ?? "",
    unit_price: null,
    total_price: Math.max(0, Math.round(it.total_price)),
    discount: 0,
  }));

  // total_amount は OCR 値そのまま採用。値引きがある場合は OCR 側で
  // discount された後の合計が来ている前提（Gemini プロンプトの指示通り）
  const total_amount = Math.max(0, Math.round(ocr.total_amount));

  return {
    purchased_at: ocr.purchased_at,
    store_name: ocr.store_name ?? "",
    total_amount,
    note:
      ocr.discounts.length > 0
        ? `値引き: ${ocr.discounts
            .map((d) => `${d.label} ${d.amount.toLocaleString()}`)
            .join(", ")}`
        : "",
    source_type: "receipt" satisfies ShoppingSource,
    image_paths: imagePaths,
    items,
  };
}

/** UUID v4 生成（crypto.randomUUID が使える場合は使う） */
export function generateImageFileName(originalName: string): string {
  const ext = (() => {
    const dot = originalName.lastIndexOf(".");
    if (dot < 0) return "jpg";
    const e = originalName.slice(dot + 1).toLowerCase();
    return /^[a-z0-9]{1,8}$/.test(e) ? e : "jpg";
  })();
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${uuid}.${ext}`;
}
