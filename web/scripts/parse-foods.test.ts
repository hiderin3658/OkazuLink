// parse-foods.ts のユニットテスト
import { describe, expect, it } from "vitest";
import {
  extractNutrition,
  normalizeName,
  normalizeNutritionValue,
  parseFoodSource,
} from "./parse-foods";
import { FOOD_SOURCE_TEXT, GROUP_SPECS } from "./foods-mapping";

describe("normalizeNutritionValue", () => {
  it("数値はそのまま返す", () => {
    expect(normalizeNutritionValue(0)).toBe(0);
    expect(normalizeNutritionValue(12.5)).toBe(12.5);
    expect(normalizeNutritionValue(100)).toBe(100);
  });

  it("null / undefined は null", () => {
    expect(normalizeNutritionValue(null)).toBeNull();
    expect(normalizeNutritionValue(undefined)).toBeNull();
  });

  it("'Tr' / '-' / 空文字は null", () => {
    expect(normalizeNutritionValue("Tr")).toBeNull();
    expect(normalizeNutritionValue("-")).toBeNull();
    expect(normalizeNutritionValue("")).toBeNull();
    expect(normalizeNutritionValue("  Tr  ")).toBeNull();
  });

  it("'(数値)' 表記は null（MVP では推定値を保持しない）", () => {
    expect(normalizeNutritionValue("(2.0)")).toBeNull();
    expect(normalizeNutritionValue("(0)")).toBeNull();
  });

  it("数値文字列は number 化する", () => {
    expect(normalizeNutritionValue("12.5")).toBe(12.5);
    expect(normalizeNutritionValue("0")).toBe(0);
  });

  it("非有限値は null", () => {
    expect(normalizeNutritionValue(Number.NaN)).toBeNull();
    expect(normalizeNutritionValue(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("オブジェクト等の異常値は null", () => {
    expect(normalizeNutritionValue({})).toBeNull();
    expect(normalizeNutritionValue([])).toBeNull();
  });
});

describe("normalizeName", () => {
  it("前後の空白を除く", () => {
    expect(normalizeName("  あずき 全粒 乾  ")).toBe("あずき 全粒 乾");
  });

  it("連続空白を 1 つにまとめる", () => {
    expect(normalizeName("生乳    ジャージー種")).toBe("生乳 ジャージー種");
  });

  it("中黒や山括弧などの記号は保持", () => {
    expect(normalizeName("<畜肉類> いのしし 肉")).toBe("<畜肉類> いのしし 肉");
  });
});

describe("extractNutrition", () => {
  it("マッピング対象キーのみを取り出す", () => {
    const row = {
      groupId: 1,
      foodId: 1001,
      indexId: 1,
      foodName: "test",
      enercKcal: 343,
      prot: 12.7,
      fat: 6,
      chocdf: 64.9,
      fib: 7.4,
      naclEq: 0,
      // マッピングに無いキー: 含めない
      water: 13.5,
      polyl: null,
    };
    const n = extractNutrition(row);
    expect(n.energy_kcal).toBe(343);
    expect(n.protein_g).toBe(12.7);
    expect(n.fat_g).toBe(6);
    expect(n.carb_g).toBe(64.9);
    expect(n.fiber_g).toBe(7.4);
    expect(n.salt_g).toBe(0);
    // マッピング外キーは含まない
    expect("water" in n).toBe(false);
    expect("polyl" in n).toBe(false);
  });

  it("欠損値や 'Tr' は null として保持される", () => {
    const row = {
      groupId: 1,
      foodId: 1001,
      indexId: 1,
      foodName: "test",
      enercKcal: 100,
      vitC: "Tr",
      vitaRae: null,
    };
    const n = extractNutrition(row);
    expect(n.vitamin_c_mg).toBeNull();
    expect(n.vitamin_a_ug).toBeNull();
  });

  it("空の row でも全マッピング先キーが null で揃う", () => {
    const row = { groupId: 1, foodId: 1001, indexId: 1, foodName: "" };
    const n = extractNutrition(row);
    expect(n.energy_kcal).toBeNull();
    expect(n.protein_g).toBeNull();
    expect(n.fat_g).toBeNull();
    expect(n.salt_g).toBeNull();
    expect(n.iron_mg).toBeNull();
  });

  it("負の値・極端な値はそのまま保持（DB 側の意味解釈に委ねる）", () => {
    const row = {
      groupId: 1,
      foodId: 1001,
      indexId: 1,
      foodName: "test",
      enercKcal: -1,
      prot: 999.999,
    };
    const n = extractNutrition(row);
    expect(n.energy_kcal).toBe(-1);
    expect(n.protein_g).toBe(999.999);
  });
});

describe("parseFoodSource", () => {
  const sampleRow = {
    groupId: 11,
    foodId: 11001,
    indexId: 100,
    foodName: " <畜肉類>  いのしし 肉 脂身つき 生 ",
    enercKcal: 244,
    prot: 18.8,
    fat: 19.8,
    chocdf: 0.5,
    fib: null,
    naclEq: 0.1,
    ca: 4,
    fe: 2.5,
    vitaRae: 4,
    vitC: 1,
    thia: 0.24,
    ribf: 0.29,
  };

  it("foodId を 5 桁ゼロ埋めにする", () => {
    const out = parseFoodSource([{ ...sampleRow, foodId: 1001 }]);
    expect(out[0]!.code).toBe("01001");
  });

  it("groupId に応じた food_group / category を引く", () => {
    const out = parseFoodSource([sampleRow]);
    expect(out[0]!.category).toBe("meat");
    expect(out[0]!.food_group).toBe(GROUP_SPECS[11]!.name);
  });

  it("foodName のホワイトスペースを正規化する", () => {
    const out = parseFoodSource([sampleRow]);
    expect(out[0]!.name).toBe("<畜肉類> いのしし 肉 脂身つき 生");
  });

  it("source を MEXT 八訂のラベルに統一する", () => {
    const out = parseFoodSource([sampleRow]);
    expect(out[0]!.source).toBe(FOOD_SOURCE_TEXT);
  });

  it("18 食品群すべてのマッピングが定義されている", () => {
    expect(Object.keys(GROUP_SPECS)).toHaveLength(18);
    for (let g = 1; g <= 18; g++) {
      expect(GROUP_SPECS[g]).toBeDefined();
    }
  });

  it("未知の groupId は other 扱いで落ちずに変換される", () => {
    const out = parseFoodSource([{ ...sampleRow, groupId: 99 }]);
    expect(out[0]!.category).toBe("other");
    expect(out[0]!.food_group).toContain("99");
  });

  it("空配列はそのまま空配列を返す", () => {
    expect(parseFoodSource([])).toEqual([]);
  });

  it("複数件を同時に変換する（順序が保たれる）", () => {
    const rows = [
      { ...sampleRow, foodId: 1001, foodName: "a" },
      { ...sampleRow, foodId: 11001, foodName: "b" },
      { ...sampleRow, foodId: 18052, foodName: "c" },
    ];
    const out = parseFoodSource(rows);
    expect(out).toHaveLength(3);
    expect(out.map((x) => x.code)).toEqual(["01001", "11001", "18052"]);
    expect(out.map((x) => x.name)).toEqual(["a", "b", "c"]);
  });
});
