import { describe, expect, it } from "vitest";
import {
  AdviceValidationError,
  validateNutritionAdvice,
} from "./validate";

const validBase = {
  summary_comment: "今月はタンパク質と鉄が不足気味です。来月は意識して摂取しましょう。",
  deficiencies: [
    {
      nutrient: "鉄",
      achievement_pct: 50,
      importance: "high",
      reason: "月経による鉄損失を補うため重要です。",
    },
  ],
  recommendations: [
    {
      food_name: "ほうれん草",
      reason: "鉄分と葉酸が豊富で、ダイエット中でも取り入れやすい。",
      nutrients: ["鉄", "葉酸", "ビタミン C"],
    },
  ],
};

describe("validateNutritionAdvice", () => {
  it("正常な入力をそのまま返す", () => {
    const out = validateNutritionAdvice(validBase);
    expect(out.summary_comment).toContain("タンパク質");
    expect(out.deficiencies).toHaveLength(1);
    expect(out.recommendations).toHaveLength(1);
  });

  it("非オブジェクトはエラー", () => {
    expect(() => validateNutritionAdvice(null)).toThrow(AdviceValidationError);
    expect(() => validateNutritionAdvice([])).toThrow(/object/i);
    expect(() => validateNutritionAdvice("text")).toThrow(/object/i);
  });

  it("summary_comment が無いとエラー", () => {
    expect(() =>
      validateNutritionAdvice({ ...validBase, summary_comment: "" }),
    ).toThrow(/summary_comment/);
  });

  it("deficiencies が配列でないとエラー", () => {
    expect(() =>
      validateNutritionAdvice({ ...validBase, deficiencies: "string" }),
    ).toThrow(/deficiencies/);
  });

  it("recommendations が配列でないとエラー", () => {
    expect(() =>
      validateNutritionAdvice({ ...validBase, recommendations: null }),
    ).toThrow(/recommendations/);
  });

  it("deficiencies は空配列を許容", () => {
    const out = validateNutritionAdvice({ ...validBase, deficiencies: [] });
    expect(out.deficiencies).toEqual([]);
  });

  it("recommendations は空配列を許容", () => {
    const out = validateNutritionAdvice({ ...validBase, recommendations: [] });
    expect(out.recommendations).toEqual([]);
  });

  it("deficiency.nutrient が無いとエラー", () => {
    expect(() =>
      validateNutritionAdvice({
        ...validBase,
        deficiencies: [{ ...validBase.deficiencies[0]!, nutrient: "" }],
      }),
    ).toThrow(/nutrient/);
  });

  it("不正な importance は medium に丸める", () => {
    const out = validateNutritionAdvice({
      ...validBase,
      deficiencies: [
        { ...validBase.deficiencies[0]!, importance: "imaginary" },
      ],
    });
    expect(out.deficiencies[0]!.importance).toBe("medium");
  });

  it("achievement_pct を 0..200 にクランプ", () => {
    const over = validateNutritionAdvice({
      ...validBase,
      deficiencies: [{ ...validBase.deficiencies[0]!, achievement_pct: 500 }],
    });
    expect(over.deficiencies[0]!.achievement_pct).toBe(200);
    const neg = validateNutritionAdvice({
      ...validBase,
      deficiencies: [{ ...validBase.deficiencies[0]!, achievement_pct: -10 }],
    });
    expect(neg.deficiencies[0]!.achievement_pct).toBe(0);
  });

  it("achievement_pct が文字列でも数値化", () => {
    const out = validateNutritionAdvice({
      ...validBase,
      deficiencies: [{ ...validBase.deficiencies[0]!, achievement_pct: "75" }],
    });
    expect(out.deficiencies[0]!.achievement_pct).toBe(75);
  });

  it("achievement_pct が無効値なら 0", () => {
    const out = validateNutritionAdvice({
      ...validBase,
      deficiencies: [{ ...validBase.deficiencies[0]!, achievement_pct: "abc" }],
    });
    expect(out.deficiencies[0]!.achievement_pct).toBe(0);
  });

  it("reason が無ければ '（理由なし）' に fallback", () => {
    const item = { ...validBase.deficiencies[0] } as Record<string, unknown>;
    delete item.reason;
    const out = validateNutritionAdvice({ ...validBase, deficiencies: [item] });
    expect(out.deficiencies[0]!.reason).toBe("（理由なし）");
  });

  it("recommendation.food_name が無いとエラー", () => {
    expect(() =>
      validateNutritionAdvice({
        ...validBase,
        recommendations: [{ ...validBase.recommendations[0]!, food_name: "" }],
      }),
    ).toThrow(/food_name/);
  });

  it("recommendation.nutrients が配列でないと空配列", () => {
    const out = validateNutritionAdvice({
      ...validBase,
      recommendations: [{ ...validBase.recommendations[0]!, nutrients: "鉄" }],
    });
    expect(out.recommendations[0]!.nutrients).toEqual([]);
  });

  it("recommendation.nutrients の空文字を除外", () => {
    const out = validateNutritionAdvice({
      ...validBase,
      recommendations: [
        {
          ...validBase.recommendations[0]!,
          nutrients: ["鉄", "", "  ", "葉酸"],
        },
      ],
    });
    expect(out.recommendations[0]!.nutrients).toEqual(["鉄", "葉酸"]);
  });

  it("複数 deficiencies の順序が保たれる", () => {
    const out = validateNutritionAdvice({
      ...validBase,
      deficiencies: [
        { nutrient: "鉄", achievement_pct: 50, importance: "high", reason: "a" },
        { nutrient: "ビタミン D", achievement_pct: 30, importance: "high", reason: "b" },
        { nutrient: "葉酸", achievement_pct: 60, importance: "medium", reason: "c" },
      ],
    });
    expect(out.deficiencies.map((d) => d.nutrient)).toEqual([
      "鉄",
      "ビタミン D",
      "葉酸",
    ]);
  });

  it("deficiencies が 8 件超の場合は先頭 8 件で truncate", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      nutrient: `n${i}`,
      achievement_pct: 50,
      importance: "low",
      reason: "x",
    }));
    const out = validateNutritionAdvice({
      ...validBase,
      deficiencies: many,
    });
    expect(out.deficiencies).toHaveLength(8);
    expect(out.deficiencies[0]!.nutrient).toBe("n0");
    expect(out.deficiencies[7]!.nutrient).toBe("n7");
  });

  it("recommendations が 10 件超の場合は先頭 10 件で truncate", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      food_name: `food${i}`,
      reason: "x",
      nutrients: [],
    }));
    const out = validateNutritionAdvice({
      ...validBase,
      recommendations: many,
    });
    expect(out.recommendations).toHaveLength(10);
    expect(out.recommendations[0]!.food_name).toBe("food0");
    expect(out.recommendations[9]!.food_name).toBe("food9");
  });
});
