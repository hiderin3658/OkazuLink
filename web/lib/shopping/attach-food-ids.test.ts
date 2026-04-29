// attachFoodIdsToItems の単体テスト（純粋関数部分）
//
// matchFood / buildFoodIndex は matcher.test.ts でカバー済みのため、
// ここでは「items が food_id を伴って正しく結合される」配線のみ検証。

import { describe, expect, it } from "vitest";
import { buildFoodIndex } from "@/lib/foods/matcher";
import { attachFoodIdsToItems } from "./actions";
import type { ShoppingItemParsed } from "./schema";

const sampleIndex = buildFoodIndex([
  { id: "f-pork", name: "豚ロース", aliases: ["ぶたロース"] },
  { id: "f-onion", name: "玉ねぎ", aliases: ["タマネギ"] },
]);

const baseItem: ShoppingItemParsed = {
  raw_name: "",
  display_name: null,
  category: "other",
  quantity: null,
  unit: null,
  unit_price: null,
  total_price: 0,
  discount: 0,
};

describe("attachFoodIdsToItems", () => {
  it("マッチした item の food_id を埋める", () => {
    const out = attachFoodIdsToItems(
      [{ ...baseItem, raw_name: "豚ロース", total_price: 398 }],
      "rec-1",
      sampleIndex,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.food_id).toBe("f-pork");
    expect(out[0]!.shopping_record_id).toBe("rec-1");
  });

  it("マッチしない item は food_id=null", () => {
    const out = attachFoodIdsToItems(
      [{ ...baseItem, raw_name: "未知の食材", total_price: 100 }],
      "rec-2",
      sampleIndex,
    );
    expect(out[0]!.food_id).toBeNull();
  });

  it("複数 items を並列に処理（順序保持）", () => {
    const out = attachFoodIdsToItems(
      [
        { ...baseItem, raw_name: "玉ねぎ", total_price: 100 },
        { ...baseItem, raw_name: "未知", total_price: 50 },
        { ...baseItem, raw_name: "ぶたロース", total_price: 400 },
      ],
      "rec-3",
      sampleIndex,
    );
    expect(out.map((it) => it.food_id)).toEqual([
      "f-onion",
      null,
      "f-pork",
    ]);
  });

  it("display_name 優先で食材を引く", () => {
    const out = attachFoodIdsToItems(
      [{ ...baseItem, raw_name: "未知のレシート表記", display_name: "玉ねぎ", total_price: 200 }],
      "rec-4",
      sampleIndex,
    );
    expect(out[0]!.food_id).toBe("f-onion");
  });

  it("空 index ではすべて null", () => {
    const out = attachFoodIdsToItems(
      [{ ...baseItem, raw_name: "豚ロース", total_price: 398 }],
      "rec-5",
      new Map(),
    );
    expect(out[0]!.food_id).toBeNull();
  });
});
