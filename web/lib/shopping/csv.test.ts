import { describe, expect, it } from "vitest";
import {
  buildCsvFileName,
  buildShoppingCsv,
  escapeCsvCell,
  SHOPPING_CSV_HEADERS,
} from "./csv";
import type { ShoppingRecordWithItems } from "@/types/database";

const baseItem = {
  id: "i1",
  shopping_record_id: "r1",
  food_id: null,
  display_name: null,
  unit_price: null,
  created_at: "2026-04-29T00:00:00Z",
};

const sampleRecord: ShoppingRecordWithItems = {
  id: "r1",
  user_id: "u1",
  purchased_at: "2026-04-27",
  store_name: "ライフ",
  total_amount: 1623,
  note: null,
  image_paths: [],
  source_type: "receipt",
  created_at: "2026-04-27T00:00:00Z",
  shopping_items: [
    {
      ...baseItem,
      raw_name: "玉ねぎ",
      category: "vegetable",
      quantity: 1,
      unit: "袋",
      total_price: 198,
      discount: 0,
    },
    {
      ...baseItem,
      id: "i2",
      raw_name: "豚ロース",
      category: "meat",
      quantity: 1,
      unit: "パック",
      total_price: 398,
      discount: 30,
    },
  ],
};

describe("escapeCsvCell", () => {
  it("通常の文字列はそのまま", () => {
    expect(escapeCsvCell("豚ロース")).toBe("豚ロース");
  });

  it("数値は文字列化", () => {
    expect(escapeCsvCell(1623)).toBe("1623");
    expect(escapeCsvCell(0)).toBe("0");
  });

  it("null / undefined / 空文字 は空", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
    expect(escapeCsvCell("")).toBe("");
  });

  it("カンマを含む値はダブルクォートで囲む", () => {
    expect(escapeCsvCell("豚, ロース")).toBe('"豚, ロース"');
  });

  it("改行を含む値はダブルクォートで囲む", () => {
    expect(escapeCsvCell("メモ1\nメモ2")).toBe('"メモ1\nメモ2"');
  });

  it("ダブルクォートは二重化してダブルクォートで囲む", () => {
    expect(escapeCsvCell('彼は"こんにちは"と言った')).toBe(
      '"彼は""こんにちは""と言った"',
    );
  });

  // CSV Injection（Excel Formula Injection）対策
  it("'=' で始まる文字列は先頭にシングルクォートを付与", () => {
    expect(escapeCsvCell("=1+1")).toBe("'=1+1");
  });

  it("'+', '-', '@' で始まる文字列も同様", () => {
    expect(escapeCsvCell("+1234567")).toBe("'+1234567");
    expect(escapeCsvCell("-DDE()")).toBe("'-DDE()");
    expect(escapeCsvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("タブやキャリッジリターン始まりも対象", () => {
    expect(escapeCsvCell("\t=1+1")).toContain("'");
  });

  it("数値型は formula injection 対策不要（負の数は数値として残す）", () => {
    // 負数は number → string で "-100" だが、value が number なので prefix 付与しない
    expect(escapeCsvCell(-100)).toBe("-100");
  });

  it("formula 文字とカンマが両方含まれる場合: 先頭にシングルクォート + 全体を quote", () => {
    const v = "=1, 2";
    const out = escapeCsvCell(v);
    expect(out).toBe("\"'=1, 2\"");
  });
});

describe("buildShoppingCsv", () => {
  it("空配列はヘッダーのみ", () => {
    const out = buildShoppingCsv([]);
    expect(out).toBe(SHOPPING_CSV_HEADERS.join(","));
  });

  it("ヘッダーが先頭行で 14 列ある", () => {
    const out = buildShoppingCsv([sampleRecord]);
    const lines = out.split("\r\n");
    expect(lines[0]).toBe(SHOPPING_CSV_HEADERS.join(","));
    expect(lines[0]!.split(",")).toHaveLength(14);
  });

  it("明細ごとに 1 行ずつ出力（同じ record の情報は繰り返し）", () => {
    const out = buildShoppingCsv([sampleRecord]);
    const lines = out.split("\r\n");
    expect(lines).toHaveLength(3); // header + 2 items
    expect(lines[1]).toContain("玉ねぎ");
    expect(lines[2]).toContain("豚ロース");
    // record 共通フィールドが各行に入る
    expect(lines[1]).toContain("ライフ");
    expect(lines[2]).toContain("ライフ");
    expect(lines[1]).toContain("2026-04-27");
    expect(lines[2]).toContain("2026-04-27");
  });

  it("カテゴリは日本語ラベルに変換", () => {
    const out = buildShoppingCsv([sampleRecord]);
    expect(out).toContain("野菜");
    expect(out).toContain("肉");
  });

  it("source_type は日本語ラベル化", () => {
    const out = buildShoppingCsv([sampleRecord]);
    expect(out).toContain("レシート");

    const manual = { ...sampleRecord, source_type: "manual" as const };
    const out2 = buildShoppingCsv([manual]);
    expect(out2).toContain("手入力");
  });

  it("値引合計を行に転記", () => {
    const out = buildShoppingCsv([sampleRecord]);
    // discount_total は items の discount 合計 = 30
    const lines = out.split("\r\n");
    // 5 列目（インデックス 4）が値引
    expect(lines[1]!.split(",")[4]).toBe("30");
  });

  it("明細が空の record も 1 行出力（記録ヘッダのみ）", () => {
    const empty: ShoppingRecordWithItems = {
      ...sampleRecord,
      shopping_items: [],
    };
    const out = buildShoppingCsv([empty]);
    const lines = out.split("\r\n");
    expect(lines).toHaveLength(2);
    // 食材名カラム（5 列目以降）が空
    const cols = lines[1]!.split(",");
    expect(cols[5]).toBe(""); // 食材名
    expect(cols[6]).toBe(""); // 表示名
  });

  it("カンマや改行を含むメモはエスケープされる", () => {
    const withSpecial: ShoppingRecordWithItems = {
      ...sampleRecord,
      note: "週末, 買い出し\n夜",
    };
    const out = buildShoppingCsv([withSpecial]);
    expect(out).toContain('"週末, 買い出し\n夜"');
  });

  it("数量に小数が含まれる場合も正しく出力", () => {
    const withDecimal: ShoppingRecordWithItems = {
      ...sampleRecord,
      shopping_items: [
        {
          ...baseItem,
          raw_name: "鶏もも",
          category: "meat",
          quantity: 0.25,
          unit: "kg",
          total_price: 350,
          discount: 0,
        },
      ],
    };
    const out = buildShoppingCsv([withDecimal]);
    expect(out).toContain("0.25");
    expect(out).toContain("kg");
  });

  it("店舗名に数式文字が含まれても安全に出力（先頭シングルクォート付与）", () => {
    const malicious: ShoppingRecordWithItems = {
      ...sampleRecord,
      store_name: "=cmd|'/c calc'!A1",
    };
    const out = buildShoppingCsv([malicious]);
    // formula injection 対策により先頭に ' が付く（カンマ等を含まないので CSV
    // 全体クオートはされない）
    expect(out).toContain("'=cmd|");
  });

  it("複数 record の場合は順序を保つ", () => {
    const r2: ShoppingRecordWithItems = {
      ...sampleRecord,
      id: "r2",
      purchased_at: "2026-04-28",
      store_name: "イオン",
      shopping_items: [
        { ...baseItem, raw_name: "鶏むね", category: "meat", quantity: 1, unit: "枚", total_price: 350, discount: 0 },
      ],
    };
    const out = buildShoppingCsv([sampleRecord, r2]);
    const lines = out.split("\r\n");
    expect(lines[1]).toContain("ライフ");
    expect(lines[lines.length - 1]).toContain("イオン");
  });
});

describe("buildCsvFileName", () => {
  it("YYYYMMDD-HHmm 形式 + .csv 拡張子", () => {
    const fn = buildCsvFileName(new Date("2026-04-29T03:05:00Z"));
    expect(fn).toMatch(/^okazu-link-shopping-\d{8}-\d{4}\.csv$/);
  });

  it("特定時刻で正確な値", () => {
    // ローカルタイムゾーンに依存するためゆるくテスト
    const d = new Date(2026, 3, 29, 7, 8); // 2026-04-29 07:08 local
    const fn = buildCsvFileName(d);
    expect(fn).toBe("okazu-link-shopping-20260429-0708.csv");
  });
});
