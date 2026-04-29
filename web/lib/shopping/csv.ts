// 買物履歴 CSV ビルダー
//
// shopping_records と shopping_items を結合した形を受け取り、
// Excel / Numbers などで開ける UTF-8 CSV を生成する。
//
// 純粋関数のため vitest でテスト可能。

import {
  FOOD_CATEGORY_LABEL,
  type FoodCategory,
  type ShoppingRecordWithItems,
} from "@/types/database";

/** CSV のヘッダー（日本語） */
export const SHOPPING_CSV_HEADERS = [
  "購入日",
  "店舗",
  "ソース",
  "明細合計",
  "値引",
  "食材名",
  "表示名",
  "カテゴリ",
  "数量",
  "単位",
  "単価",
  "金額",
  "値引額",
  "メモ",
] as const;

const SOURCE_LABEL = {
  receipt: "レシート",
  manual: "手入力",
} as const;

/** 1 セルの値を CSV 用にエスケープする。
 *
 *  対応:
 *  - カンマ・改行・ダブルクォートを含む場合は "..." で囲み、内側の " は二重に
 *  - Excel/Numbers の数式注入（CSV injection）対策として、=, +, -, @,
 *    タブ・キャリッジリターン で始まる値は先頭に半角シングルクォート ' を付与
 *    （= "=1+1" のようなセル値が数式実行されるのを防止）
 *
 *  References:
 *  - https://owasp.org/www-community/attacks/CSV_Injection
 */
const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (s === "") return "";
  // 数式注入対策（数値型はそのまま安全な数値として残したいので number は除外）
  if (typeof value === "string" && FORMULA_PREFIX_RE.test(s)) {
    s = `'${s}`;
  }
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function categoryLabel(c: string): string {
  return FOOD_CATEGORY_LABEL[c as FoodCategory] ?? c;
}

/** 買物履歴の records を平坦化して CSV 文字列にする。
 *  Excel が UTF-8 を正しく読めるよう、呼出側で BOM を付ける想定（本関数は付けない）。 */
export function buildShoppingCsv(records: ShoppingRecordWithItems[]): string {
  const lines: string[] = [];
  lines.push(SHOPPING_CSV_HEADERS.join(","));

  for (const rec of records) {
    const items = rec.shopping_items ?? [];
    const recordHeader = {
      purchased_at: rec.purchased_at,
      store_name: rec.store_name ?? "",
      source: SOURCE_LABEL[rec.source_type],
      total_amount: rec.total_amount,
      discount_total: items.reduce((sum, it) => sum + (it.discount ?? 0), 0),
      note: rec.note ?? "",
    };

    if (items.length === 0) {
      // 明細なしのレコードも 1 行として出す
      lines.push(
        [
          escapeCsvCell(recordHeader.purchased_at),
          escapeCsvCell(recordHeader.store_name),
          escapeCsvCell(recordHeader.source),
          escapeCsvCell(recordHeader.total_amount),
          escapeCsvCell(recordHeader.discount_total),
          "", // 食材名
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          escapeCsvCell(recordHeader.note),
        ].join(","),
      );
      continue;
    }

    for (const it of items) {
      lines.push(
        [
          escapeCsvCell(recordHeader.purchased_at),
          escapeCsvCell(recordHeader.store_name),
          escapeCsvCell(recordHeader.source),
          escapeCsvCell(recordHeader.total_amount),
          escapeCsvCell(recordHeader.discount_total),
          escapeCsvCell(it.raw_name),
          escapeCsvCell(it.display_name ?? ""),
          escapeCsvCell(categoryLabel(it.category)),
          escapeCsvCell(it.quantity ?? ""),
          escapeCsvCell(it.unit ?? ""),
          escapeCsvCell(it.unit_price ?? ""),
          escapeCsvCell(it.total_price),
          escapeCsvCell(it.discount),
          escapeCsvCell(recordHeader.note),
        ].join(","),
      );
    }
  }

  return lines.join("\r\n");
}

/** ダウンロード用ファイル名を生成（YYYYMMDD-HHmm 形式） */
export function buildCsvFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `okazu-link-shopping-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.csv`;
}
