// 模擬レシートテンプレートの単体テスト
import { describe, expect, it } from "vitest";
import { buildReceiptHtml } from "./template";
import type { MockReceipt } from "./data";

const baseReceipt: MockReceipt = {
  slug: "test",
  store: "テストマート",
  date: "2026-04-01",
  weekday: "水",
  items: [
    { name: "玉ねぎ", unitPrice: 98 },
    { name: "ほうれん草", unitPrice: 100 },
  ],
  total: 198,
};

describe("buildReceiptHtml", () => {
  it("店名と日付がヘッダに含まれる", () => {
    const html = buildReceiptHtml(baseReceipt);
    expect(html).toContain("テストマート");
    expect(html).toContain("2026年4月1日(水)");
  });

  it("明細の商品名と金額が含まれる", () => {
    const html = buildReceiptHtml(baseReceipt);
    expect(html).toContain("玉ねぎ");
    expect(html).toContain("¥98");
    expect(html).toContain("ほうれん草");
    expect(html).toContain("¥100");
  });

  it("合計が含まれる", () => {
    const html = buildReceiptHtml(baseReceipt);
    expect(html).toContain("合計");
    expect(html).toContain("¥198");
  });

  it("クーポン値引が含まれる", () => {
    const html = buildReceiptHtml({ ...baseReceipt, coupon: 50, total: 148 });
    expect(html).toContain("クーポン値引");
    expect(html).toContain("-¥50");
  });

  it("クーポンなしの場合は値引行が出ない", () => {
    const html = buildReceiptHtml(baseReceipt);
    expect(html).not.toContain("クーポン値引");
  });

  it("数量 2 以上は単価 × 数量の補助行が出る", () => {
    const html = buildReceiptHtml({
      ...baseReceipt,
      items: [{ name: "おかずキャベツ", unitPrice: 196, quantity: 2 }],
    });
    expect(html).toContain("¥196 × 2");
  });

  it("HTML エスケープが適用される（XSS 対策）", () => {
    const html = buildReceiptHtml({
      ...baseReceipt,
      store: '<script>alert("xss")</script>',
    });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("曜日なしでも日付フォーマットが破綻しない", () => {
    const html = buildReceiptHtml({ ...baseReceipt, weekday: undefined });
    expect(html).toContain("2026年4月1日");
    expect(html).not.toContain("()");
  });

  it("subtotal が指定されていればその値を使う", () => {
    const html = buildReceiptHtml({
      ...baseReceipt,
      items: [
        { name: "セット品", unitPrice: 1000, quantity: 1, subtotal: 800 },
      ],
      total: 800,
    });
    expect(html).toContain("¥800");
  });

  it("discount 指定時は値引行が個別に出る", () => {
    const html = buildReceiptHtml({
      ...baseReceipt,
      items: [{ name: "牛乳", unitPrice: 200, discount: 30 }],
    });
    expect(html).toContain("-¥30");
  });
});
