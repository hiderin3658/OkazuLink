import { describe, expect, it } from "vitest";
import {
  buildNutritionCsv,
  buildNutritionCsvFileName,
  escapeCsvCell,
  NUTRITION_CSV_HEADERS,
} from "./csv";
import type { NutritionSummary } from "./types";

const sampleSummary: NutritionSummary = {
  totals: {
    energy_kcal: 60000,
    protein_g: 1200,
    fat_g: 1500,
    carb_g: 8500,
    fiber_g: 480,
    salt_g: 200,
    calcium_mg: 18000,
    iron_mg: 280,
    vitamin_a_ug: 18000,
    vitamin_c_mg: 2500,
    vitamin_d_ug: 200,
    vitamin_b1_mg: 30,
    vitamin_b2_mg: 35,
    vitamin_b6_mg: 30,
    vitamin_b12_ug: 70,
    folate_ug: 6500,
    potassium_mg: 55000,
    magnesium_mg: 7500,
    phosphorus_mg: 22000,
    zinc_mg: 220,
  },
  record_count: 8,
  item_count: 60,
  unmatched_count: 3,
  notes: ["数量が未入力の食材を 1 個として概算しています。"],
};

describe("escapeCsvCell", () => {
  it("数式 injection を防ぐ", () => {
    expect(escapeCsvCell("=cmd|'/c calc'!A1")).toContain("'=cmd");
    expect(escapeCsvCell("+1234")).toBe("'+1234");
  });

  it("カンマ・改行はクオート", () => {
    expect(escapeCsvCell("a, b\nc")).toBe('"a, b\nc"');
  });

  it("数値 / null / 空文字", () => {
    expect(escapeCsvCell(123)).toBe("123");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell("")).toBe("");
  });
});

describe("buildNutritionCsv", () => {
  it("ヘッダーは 8 列", () => {
    const csv = buildNutritionCsv({
      monthStart: "2026-04-01",
      birthYear: 1990,
      summary: sampleSummary,
    });
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(NUTRITION_CSV_HEADERS.join(","));
    expect(lines[0]!.split(",")).toHaveLength(8);
  });

  it("各栄養素 1 行で 20 行 + notes 1 行 = 21 行 + ヘッダー", () => {
    const csv = buildNutritionCsv({
      monthStart: "2026-04-01",
      birthYear: 1990,
      summary: sampleSummary,
    });
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(1 + 20 + 1); // header + 20 nutrients + 1 notes
  });

  it("対象月ラベルが「YYYY年M月」表記で全行に入る", () => {
    const csv = buildNutritionCsv({
      monthStart: "2026-04-01",
      birthYear: 1990,
      summary: sampleSummary,
    });
    expect(csv).toContain("2026年4月");
  });

  it("birthYear から年齢区分を推定し、計算前提に入る", () => {
    const csv = buildNutritionCsv({
      monthStart: "2026-04-01",
      birthYear: 1990, // 36 歳 → 30-49
      summary: sampleSummary,
    });
    expect(csv).toContain("30-49 女性");
    expect(csv).toContain("月日数: 30");
  });

  it("birthYear null は 30-49 にフォールバック", () => {
    const csv = buildNutritionCsv({
      monthStart: "2026-04-01",
      birthYear: null,
      summary: sampleSummary,
    });
    expect(csv).toContain("30-49 女性");
  });

  it("達成率が 70% 未満の栄養素は「不足」判定", () => {
    // ビタミン D 200μg/月 vs 推奨 8.5×30=255μg → 78% は「やや不足」
    // 推奨より明確に下回る食塩 0g など特殊例で「不足」になるか検証
    const lowSummary: NutritionSummary = {
      ...sampleSummary,
      totals: { ...sampleSummary.totals, iron_mg: 50 }, // 鉄 50mg vs 10.5×30=315mg → 16%
    };
    const csv = buildNutritionCsv({
      monthStart: "2026-04-01",
      birthYear: 1990,
      summary: lowSummary,
    });
    // 鉄行に「不足」が含まれる
    const ironLine = csv.split("\r\n").find((l) => l.startsWith("2026年4月,鉄"));
    expect(ironLine).toBeDefined();
    expect(ironLine).toContain("不足");
  });

  it("食塩は上限扱いで 100% 超は「過剰」判定", () => {
    const highSalt: NutritionSummary = {
      ...sampleSummary,
      totals: { ...sampleSummary.totals, salt_g: 300 }, // 推奨 6.5×30=195g → 154%
    };
    const csv = buildNutritionCsv({
      monthStart: "2026-04-01",
      birthYear: 1990,
      summary: highSalt,
    });
    const saltLine = csv.split("\r\n").find((l) => l.startsWith("2026年4月,食塩"));
    expect(saltLine).toContain("過剰");
  });

  it("notes は最終行に「計算前提」として追加", () => {
    const csv = buildNutritionCsv({
      monthStart: "2026-04-01",
      birthYear: 1990,
      summary: sampleSummary,
    });
    const lines = csv.split("\r\n");
    expect(lines[lines.length - 1]).toContain("計算前提");
    expect(lines[lines.length - 1]).toContain("数量が未入力");
  });

  it("notes が空なら最終行を出さない", () => {
    const noNotes: NutritionSummary = { ...sampleSummary, notes: [] };
    const csv = buildNutritionCsv({
      monthStart: "2026-04-01",
      birthYear: 1990,
      summary: noNotes,
    });
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(1 + 20); // header + 20 nutrients
  });
});

describe("buildNutritionCsvFileName", () => {
  it("年月を抽出した形式", () => {
    expect(buildNutritionCsvFileName("2026-04-01")).toBe(
      "okazu-link-nutrition-202604.csv",
    );
    expect(buildNutritionCsvFileName("2025-12-01")).toBe(
      "okazu-link-nutrition-202512.csv",
    );
  });
});
