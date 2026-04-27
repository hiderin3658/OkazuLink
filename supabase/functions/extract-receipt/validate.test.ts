import { describe, expect, it } from "vitest";
import { OcrValidationError, validateOcrResult } from "./validate";

const validBase = {
  store_name: "ライフ",
  purchased_at: "2026-04-27",
  total_amount: 1623,
  items: [
    {
      raw_name: "玉ねぎ",
      quantity: 1,
      unit: "袋",
      total_price: 198,
      category: "vegetable",
    },
  ],
  discounts: [],
  confidence: 0.92,
};

describe("validateOcrResult", () => {
  it("正常な入力をそのまま返す", () => {
    const out = validateOcrResult(validBase);
    expect(out.store_name).toBe("ライフ");
    expect(out.purchased_at).toBe("2026-04-27");
    expect(out.total_amount).toBe(1623);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.raw_name).toBe("玉ねぎ");
    expect(out.discounts).toEqual([]);
    expect(out.confidence).toBeCloseTo(0.92, 2);
  });

  it("非オブジェクトは throw", () => {
    expect(() => validateOcrResult(null)).toThrow(OcrValidationError);
    expect(() => validateOcrResult("string")).toThrow(OcrValidationError);
    expect(() => validateOcrResult(42)).toThrow(OcrValidationError);
  });

  it("items が空配列なら throw", () => {
    expect(() => validateOcrResult({ ...validBase, items: [] })).toThrow(
      /non-empty/i,
    );
  });

  it("items が未定義なら throw", () => {
    const { items: _, ...rest } = validBase;
    void _;
    expect(() => validateOcrResult(rest)).toThrow(OcrValidationError);
  });

  it("total_amount が無いと throw", () => {
    const { total_amount: _, ...rest } = validBase;
    void _;
    expect(() => validateOcrResult(rest)).toThrow(/total_amount/);
  });

  it("total_amount が文字列でも数値化", () => {
    const out = validateOcrResult({ ...validBase, total_amount: "1500" });
    expect(out.total_amount).toBe(1500);
  });

  it("'¥1,500' 表記も整数化（記号除去）", () => {
    const out = validateOcrResult({ ...validBase, total_amount: "¥1,500" });
    expect(out.total_amount).toBe(1500);
  });

  it("purchased_at の形式が不正なら今日の日付を fallback", () => {
    const today = new Date().toISOString().slice(0, 10);
    const out = validateOcrResult({ ...validBase, purchased_at: "2026/04/27" });
    expect(out.purchased_at).toBe(today);
  });

  it("purchased_at が無い場合も今日の日付を fallback", () => {
    const today = new Date().toISOString().slice(0, 10);
    const { purchased_at: _, ...rest } = validBase;
    void _;
    const out = validateOcrResult(rest);
    expect(out.purchased_at).toBe(today);
  });

  it("不正な category は other に丸める", () => {
    const out = validateOcrResult({
      ...validBase,
      items: [{ ...validBase.items[0]!, category: "imaginary" }],
    });
    expect(out.items[0]!.category).toBe("other");
  });

  it("category 未指定は other", () => {
    const item = { ...validBase.items[0] } as Record<string, unknown>;
    delete item.category;
    const out = validateOcrResult({ ...validBase, items: [item] });
    expect(out.items[0]!.category).toBe("other");
  });

  it("item.raw_name が空なら throw", () => {
    expect(() =>
      validateOcrResult({
        ...validBase,
        items: [{ ...validBase.items[0]!, raw_name: "" }],
      }),
    ).toThrow(/raw_name/);
  });

  it("item.total_price が無いと throw", () => {
    const item = { ...validBase.items[0] } as Record<string, unknown>;
    delete item.total_price;
    expect(() => validateOcrResult({ ...validBase, items: [item] })).toThrow(
      /total_price/,
    );
  });

  it("quantity に文字列・null が混じっても許容", () => {
    const out = validateOcrResult({
      ...validBase,
      items: [
        { ...validBase.items[0]!, quantity: "2.5" },
        { ...validBase.items[0]!, raw_name: "豆腐", quantity: null, total_price: 80 },
        { ...validBase.items[0]!, raw_name: "ねぎ", quantity: undefined, total_price: 100 },
      ],
    });
    expect(out.items[0]!.quantity).toBe(2.5);
    expect(out.items[1]!.quantity).toBeNull();
    expect(out.items[2]!.quantity).toBeNull();
  });

  it("discounts は形式を整え、不正要素は除く", () => {
    const out = validateOcrResult({
      ...validBase,
      discounts: [
        { label: "クーポン", amount: -60 },
        { label: "セール", amount: "abc" }, // 数値化失敗 → 除外
        "string", // オブジェクトではない → 除外
        { amount: -100 }, // label 無し → "discount" にフォールバック
      ],
    });
    expect(out.discounts).toEqual([
      { label: "クーポン", amount: -60 },
      { label: "discount", amount: -100 },
    ]);
  });

  it("discounts が undefined / null でも空配列で返す", () => {
    const out = validateOcrResult({ ...validBase, discounts: undefined });
    expect(out.discounts).toEqual([]);
    const out2 = validateOcrResult({ ...validBase, discounts: null });
    expect(out2.discounts).toEqual([]);
  });

  it("confidence は 0..1 にクランプ", () => {
    expect(validateOcrResult({ ...validBase, confidence: 1.5 }).confidence).toBe(1);
    expect(validateOcrResult({ ...validBase, confidence: -0.1 }).confidence).toBe(0);
  });

  it("confidence が無ければ 0.5 を fallback", () => {
    const { confidence: _, ...rest } = validBase;
    void _;
    expect(validateOcrResult(rest).confidence).toBe(0.5);
  });

  it("store_name は trim、空なら null", () => {
    const out = validateOcrResult({ ...validBase, store_name: "   " });
    expect(out.store_name).toBeNull();
    const out2 = validateOcrResult({ ...validBase, store_name: "  ライフ  " });
    expect(out2.store_name).toBe("ライフ");
  });
});
