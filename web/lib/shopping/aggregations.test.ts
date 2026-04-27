import { describe, expect, it } from "vitest";
import {
  aggregateMonthlySummary,
  dedupeIngredientNames,
} from "./aggregations";

describe("aggregateMonthlySummary", () => {
  it("空配列は空配列", () => {
    expect(aggregateMonthlySummary([])).toEqual([]);
  });

  it("同じ月のレコードを合算", () => {
    const out = aggregateMonthlySummary([
      { purchased_at: "2026-04-10", total_amount: 1000 },
      { purchased_at: "2026-04-15", total_amount: 2500 },
      { purchased_at: "2026-04-27", total_amount: 800 },
    ]);
    expect(out).toEqual([
      { year_month: "2026-04", total: 4300, record_count: 3 },
    ]);
  });

  it("複数月をまたぎ、新しい順に並べる", () => {
    const out = aggregateMonthlySummary([
      { purchased_at: "2026-02-05", total_amount: 1000 },
      { purchased_at: "2026-04-10", total_amount: 2000 },
      { purchased_at: "2026-03-15", total_amount: 1500 },
      { purchased_at: "2026-04-20", total_amount: 3000 },
    ]);
    expect(out).toEqual([
      { year_month: "2026-04", total: 5000, record_count: 2 },
      { year_month: "2026-03", total: 1500, record_count: 1 },
      { year_month: "2026-02", total: 1000, record_count: 1 },
    ]);
  });

  it("年をまたぐ並び替え", () => {
    const out = aggregateMonthlySummary([
      { purchased_at: "2025-12-31", total_amount: 100 },
      { purchased_at: "2026-01-01", total_amount: 200 },
    ]);
    expect(out[0]!.year_month).toBe("2026-01");
    expect(out[1]!.year_month).toBe("2025-12");
  });
});

describe("dedupeIngredientNames", () => {
  it("display_name が優先される", () => {
    const out = dedupeIngredientNames(
      [
        { raw_name: "ぶたバラ", display_name: "豚バラ" },
        { raw_name: "豚バラ", display_name: null },
      ],
      10,
    );
    expect(out).toEqual(["豚バラ"]);
  });

  it("limit を超えない", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      raw_name: `食材${i}`,
      display_name: null,
    }));
    const out = dedupeIngredientNames(rows, 5);
    expect(out).toHaveLength(5);
    expect(out[0]).toBe("食材0");
    expect(out[4]).toBe("食材4");
  });

  it("入力順を保つ（新しい順 = 入力順）", () => {
    const out = dedupeIngredientNames(
      [
        { raw_name: "C", display_name: null },
        { raw_name: "B", display_name: null },
        { raw_name: "A", display_name: null },
      ],
      10,
    );
    expect(out).toEqual(["C", "B", "A"]);
  });

  it("空入力は空配列を返す", () => {
    expect(dedupeIngredientNames([], 10)).toEqual([]);
  });
});
