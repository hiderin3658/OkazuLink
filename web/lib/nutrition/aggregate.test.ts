import { describe, expect, it } from "vitest";
import {
  accumulateNutrition,
  aggregateMonthly,
  createEmptySummary,
  estimateGrams,
} from "./aggregate";
import type { NutritionPer100g } from "./types";

const porkRoast: NutritionPer100g = {
  energy_kcal: 244,
  protein_g: 18.8,
  fat_g: 19.8,
  carb_g: 0.5,
  fiber_g: null,
  salt_g: 0.1,
  calcium_mg: 4,
  iron_mg: 0.6,
};

const onion: NutritionPer100g = {
  energy_kcal: 33,
  protein_g: 1.0,
  fat_g: 0.1,
  carb_g: 8.4,
  fiber_g: 1.5,
  salt_g: 0,
  calcium_mg: 17,
  iron_mg: 0.3,
};

const foodMap = new Map<string, NutritionPer100g>([
  ["f-pork", porkRoast],
  ["f-onion", onion],
]);

describe("estimateGrams", () => {
  it("g / グラム は quantity をそのまま", () => {
    expect(estimateGrams(150, "g")).toBe(150);
    expect(estimateGrams(150, "グラム")).toBe(150);
    expect(estimateGrams(150, "ｇ")).toBe(150);
  });

  it("kg / キログラム は × 1000", () => {
    expect(estimateGrams(0.5, "kg")).toBe(500);
    expect(estimateGrams(0.5, "キログラム")).toBe(500);
  });

  it("mg / ミリグラム は ÷ 1000", () => {
    expect(estimateGrams(500, "mg")).toBe(0.5);
  });

  it("ml / リットル は g 等価扱い", () => {
    expect(estimateGrams(200, "ml")).toBe(200);
    expect(estimateGrams(1, "L")).toBe(1000);
  });

  it("単位なし・個・パック等は 1 個 = 100g", () => {
    expect(estimateGrams(1, "個")).toBe(100);
    expect(estimateGrams(2, "パック")).toBe(200);
    expect(estimateGrams(1, null)).toBe(100);
    expect(estimateGrams(1, "")).toBe(100);
  });

  it("quantity null は 1 として扱う", () => {
    expect(estimateGrams(null, "g")).toBe(1);
    expect(estimateGrams(null, "個")).toBe(100);
  });

  it("負の quantity は 0", () => {
    expect(estimateGrams(-1, "g")).toBe(0);
  });

  it("quantity 0 は 0", () => {
    expect(estimateGrams(0, "g")).toBe(0);
  });

  it("大文字小文字は区別しない", () => {
    expect(estimateGrams(1, "KG")).toBe(1000);
    expect(estimateGrams(1, "Kg")).toBe(1000);
  });
});

describe("createEmptySummary", () => {
  it("全栄養素 0 + 件数 0", () => {
    const s = createEmptySummary();
    expect(s.totals.energy_kcal).toBe(0);
    expect(s.totals.protein_g).toBe(0);
    expect(s.totals.zinc_mg).toBe(0);
    expect(s.record_count).toBe(0);
    expect(s.item_count).toBe(0);
    expect(s.unmatched_count).toBe(0);
    expect(s.notes).toEqual([]);
  });
});

describe("accumulateNutrition", () => {
  it("100g なら nutrition_per_100g 値そのまま加算", () => {
    const totals = createEmptySummary().totals;
    accumulateNutrition(totals, porkRoast, 100);
    expect(totals.energy_kcal).toBe(244);
    expect(totals.protein_g).toBeCloseTo(18.8, 5);
  });

  it("200g なら 2 倍", () => {
    const totals = createEmptySummary().totals;
    accumulateNutrition(totals, porkRoast, 200);
    expect(totals.energy_kcal).toBe(488);
  });

  it("50g なら半分", () => {
    const totals = createEmptySummary().totals;
    accumulateNutrition(totals, porkRoast, 50);
    expect(totals.energy_kcal).toBe(122);
  });

  it("0g 以下は加算しない", () => {
    const totals = createEmptySummary().totals;
    accumulateNutrition(totals, porkRoast, 0);
    expect(totals.energy_kcal).toBe(0);
  });

  it("null 値は無視（NaN を避ける）", () => {
    const totals = createEmptySummary().totals;
    accumulateNutrition(totals, porkRoast, 100);
    expect(totals.fiber_g).toBe(0); // porkRoast.fiber_g === null
  });

  it("複数 food を続けて加算", () => {
    const totals = createEmptySummary().totals;
    accumulateNutrition(totals, porkRoast, 100);
    accumulateNutrition(totals, onion, 100);
    expect(totals.energy_kcal).toBe(244 + 33);
    expect(totals.protein_g).toBeCloseTo(18.8 + 1.0, 5);
  });
});

describe("aggregateMonthly", () => {
  it("空 records は空 summary（notes も空）", () => {
    const out = aggregateMonthly([], foodMap);
    expect(out.totals.energy_kcal).toBe(0);
    expect(out.record_count).toBe(0);
    expect(out.notes).toEqual([]);
  });

  it("単一 record・単一 item でエネルギー計算", () => {
    const out = aggregateMonthly(
      [
        {
          shopping_items: [
            { food_id: "f-pork", quantity: 200, unit: "g" },
          ],
        },
      ],
      foodMap,
    );
    expect(out.record_count).toBe(1);
    expect(out.item_count).toBe(1);
    expect(out.unmatched_count).toBe(0);
    expect(out.totals.energy_kcal).toBe(488);
    expect(out.notes).toEqual([]);
  });

  it("food_id null は unmatched_count に算入", () => {
    const out = aggregateMonthly(
      [
        {
          shopping_items: [
            { food_id: null, quantity: 1, unit: "個" },
            { food_id: "f-pork", quantity: 100, unit: "g" },
          ],
        },
      ],
      foodMap,
    );
    expect(out.item_count).toBe(2);
    expect(out.unmatched_count).toBe(1);
    expect(out.totals.energy_kcal).toBe(244);
    expect(out.notes.some((n) => n.includes("foods マスタと紐付かず"))).toBe(true);
  });

  it("foods マップに無い food_id は unmatched", () => {
    const out = aggregateMonthly(
      [
        {
          shopping_items: [{ food_id: "f-unknown", quantity: 100, unit: "g" }],
        },
      ],
      foodMap,
    );
    expect(out.unmatched_count).toBe(1);
    expect(out.totals.energy_kcal).toBe(0);
  });

  it("単位不明（個）は notes に概算注記を出す", () => {
    const out = aggregateMonthly(
      [
        {
          shopping_items: [{ food_id: "f-onion", quantity: 1, unit: "個" }],
        },
      ],
      foodMap,
    );
    expect(out.totals.energy_kcal).toBe(33); // 100g 換算なので onion の per100g そのまま
    expect(out.notes.some((n) => n.includes("100g として概算"))).toBe(true);
  });

  it("quantity 未入力の場合は notes に注記", () => {
    const out = aggregateMonthly(
      [
        {
          shopping_items: [{ food_id: "f-onion", quantity: null, unit: "個" }],
        },
      ],
      foodMap,
    );
    expect(out.notes.some((n) => n.includes("数量が未入力"))).toBe(true);
  });

  it("複数 record をまたいで合計", () => {
    const out = aggregateMonthly(
      [
        { shopping_items: [{ food_id: "f-pork", quantity: 100, unit: "g" }] },
        { shopping_items: [{ food_id: "f-onion", quantity: 200, unit: "g" }] },
      ],
      foodMap,
    );
    expect(out.record_count).toBe(2);
    expect(out.item_count).toBe(2);
    expect(out.totals.energy_kcal).toBe(244 + 33 * 2);
  });

  it("totals は小数 2 桁に丸める", () => {
    const out = aggregateMonthly(
      [
        {
          shopping_items: [{ food_id: "f-pork", quantity: 33, unit: "g" }],
        },
      ],
      foodMap,
    );
    // 244 * 0.33 = 80.52
    expect(out.totals.energy_kcal).toBe(80.52);
  });
});
