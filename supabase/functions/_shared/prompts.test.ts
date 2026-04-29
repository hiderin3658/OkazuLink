import { describe, expect, it } from "vitest";
import {
  buildAdviceCacheKey,
  buildNutritionAdvicePrompt,
  buildRecipeCacheKey,
  buildRecipeSuggestPrompt,
  buildReceiptOcrPrompt,
} from "./prompts";

describe("buildReceiptOcrPrompt", () => {
  it("system に食生活コーチペルソナが含まれる", () => {
    const p = buildReceiptOcrPrompt();
    expect(p.system).toContain("食生活コーチ");
  });

  it("user にレシート抽出 JSON Schema 説明が入る", () => {
    const p = buildReceiptOcrPrompt();
    expect(p.user).toContain("store_name");
    expect(p.user).toContain("purchased_at");
    expect(p.user).toContain("items");
    expect(p.user).toContain("confidence");
  });

  it("category enum に 11 値すべて記載", () => {
    const p = buildReceiptOcrPrompt();
    [
      "vegetable",
      "meat",
      "fish",
      "dairy",
      "grain",
      "seasoning",
      "beverage",
      "sweet",
      "fruit",
      "egg",
      "other",
    ].forEach((c) => {
      expect(p.user).toContain(c);
    });
  });

  it("hint があれば user に追記される", () => {
    const p = buildReceiptOcrPrompt({ hint: "ローソンのレシート" });
    expect(p.user).toContain("ローソンのレシート");
  });
});

describe("buildRecipeSuggestPrompt", () => {
  const base = {
    ingredients: ["豚ロース", "玉ねぎ"],
    cuisine: "japanese",
    candidateCount: 3,
  };

  it("食材とジャンルがプロンプトに含まれる", () => {
    const p = buildRecipeSuggestPrompt(base);
    expect(p.user).toContain("豚ロース");
    expect(p.user).toContain("玉ねぎ");
    expect(p.user).toContain("japanese");
    expect(p.user).toContain("3");
  });

  it("アレルギーは「絶対に含めない」と指示される", () => {
    const p = buildRecipeSuggestPrompt({ ...base, allergies: ["卵", "牛乳"] });
    expect(p.user).toContain("卵");
    expect(p.user).toContain("牛乳");
    expect(p.user).toContain("絶対に含めない");
  });

  it("苦手食材はアレルギーと別に記載", () => {
    const p = buildRecipeSuggestPrompt({ ...base, dislikedFoods: ["パクチー"] });
    expect(p.user).toContain("パクチー");
    expect(p.user).toContain("極力避ける");
  });

  it("candidateCount 既定は 4", () => {
    const p = buildRecipeSuggestPrompt({ ingredients: ["a"], cuisine: "japanese" });
    expect(p.user).toContain("4");
  });

  it("system にコーチペルソナ", () => {
    const p = buildRecipeSuggestPrompt(base);
    expect(p.system).toContain("食生活コーチ");
  });
});

describe("buildRecipeCacheKey", () => {
  const a = {
    ingredients: ["豚ロース", "玉ねぎ", "にんじん"],
    cuisine: "japanese",
    candidateCount: 4,
  };
  const b = {
    ingredients: ["にんじん", "豚ロース", "玉ねぎ"], // 順序違いだけ
    cuisine: "japanese",
    candidateCount: 4,
  };

  it("食材順序が違っても同じキー", () => {
    expect(buildRecipeCacheKey(a)).toBe(buildRecipeCacheKey(b));
  });

  it("ジャンルが違えば別キー", () => {
    const c = { ...a, cuisine: "chinese" };
    expect(buildRecipeCacheKey(a)).not.toBe(buildRecipeCacheKey(c));
  });

  it("candidateCount が違えば別キー", () => {
    const c = { ...a, candidateCount: 5 };
    expect(buildRecipeCacheKey(a)).not.toBe(buildRecipeCacheKey(c));
  });

  it("アレルギー差で別キー", () => {
    const c = { ...a, allergies: ["卵"] };
    expect(buildRecipeCacheKey(a)).not.toBe(buildRecipeCacheKey(c));
  });

  it("アレルギー順序差では同じキー", () => {
    const c1 = { ...a, allergies: ["卵", "牛乳"] };
    const c2 = { ...a, allergies: ["牛乳", "卵"] };
    expect(buildRecipeCacheKey(c1)).toBe(buildRecipeCacheKey(c2));
  });

  it("食材 trim も適用", () => {
    const c = { ...a, ingredients: ["  豚ロース  ", "玉ねぎ", "にんじん"] };
    expect(buildRecipeCacheKey(a)).toBe(buildRecipeCacheKey(c));
  });
});

describe("buildNutritionAdvicePrompt", () => {
  const base = {
    monthLabel: "2026年4月",
    ageGroup: "30-49 女性",
    monthDays: 30,
    achievements: [
      { label: "タンパク質", pct: 0.8 },
      { label: "鉄", pct: 0.5 },
      { label: "ビタミン D", pct: 0.3 },
      { label: "食塩", pct: 1.2, isUpperBound: true },
    ],
    goalType: "ダイエット",
    allergies: ["卵"],
    dislikedFoods: ["パクチー"],
  };

  it("system にコーチペルソナ", () => {
    const p = buildNutritionAdvicePrompt(base);
    expect(p.system).toContain("食生活コーチ");
  });

  it("user に対象期間・プロフィールが含まれる", () => {
    const p = buildNutritionAdvicePrompt(base);
    expect(p.user).toContain("2026年4月");
    expect(p.user).toContain("30-49 女性");
    expect(p.user).toContain("30 日間");
    expect(p.user).toContain("ダイエット");
  });

  it("アレルギー・苦手食材が明示される", () => {
    const p = buildNutritionAdvicePrompt(base);
    expect(p.user).toContain("卵");
    expect(p.user).toContain("絶対除外");
    expect(p.user).toContain("パクチー");
    expect(p.user).toContain("極力避ける");
  });

  it("達成率の数値が含まれ、不足/過剰のラベリング", () => {
    const p = buildNutritionAdvicePrompt(base);
    expect(p.user).toContain("タンパク質: 80%");
    expect(p.user).toContain("鉄: 50%（不足）");
    expect(p.user).toContain("ビタミン D: 30%（不足）");
    expect(p.user).toContain("食塩: 120%（過剰）");
  });

  it("出力 JSON フォーマットが指示される", () => {
    const p = buildNutritionAdvicePrompt(base);
    expect(p.user).toContain("summary_comment");
    expect(p.user).toContain("deficiencies");
    expect(p.user).toContain("recommendations");
  });

  it("goalType / allergies / disliked が空でも動作", () => {
    const p = buildNutritionAdvicePrompt({
      ...base,
      goalType: null,
      allergies: [],
      dislikedFoods: [],
    });
    expect(p.user).not.toContain("【目標】");
    expect(p.user).not.toContain("【アレルギー");
    expect(p.user).not.toContain("【苦手な食材");
  });
});

describe("buildAdviceCacheKey", () => {
  const a = {
    monthLabel: "2026年4月",
    ageGroup: "30-49 女性",
    monthDays: 30,
    achievements: [
      { label: "鉄", pct: 0.5 },
      { label: "タンパク質", pct: 0.8 },
    ],
    goalType: "ダイエット",
  };

  it("同じ入力なら同じキー", () => {
    expect(buildAdviceCacheKey(a)).toBe(buildAdviceCacheKey(a));
  });

  it("達成率の順序差は同じキー", () => {
    const b = {
      ...a,
      achievements: [
        { label: "タンパク質", pct: 0.8 },
        { label: "鉄", pct: 0.5 },
      ],
    };
    expect(buildAdviceCacheKey(a)).toBe(buildAdviceCacheKey(b));
  });

  it("達成率の値が違えば別キー", () => {
    const b = {
      ...a,
      achievements: [
        { label: "鉄", pct: 0.6 },
        { label: "タンパク質", pct: 0.8 },
      ],
    };
    expect(buildAdviceCacheKey(a)).not.toBe(buildAdviceCacheKey(b));
  });

  it("月が違えば別キー", () => {
    const b = { ...a, monthLabel: "2026年5月" };
    expect(buildAdviceCacheKey(a)).not.toBe(buildAdviceCacheKey(b));
  });

  it("アレルギー順序差は同じキー", () => {
    const b1 = { ...a, allergies: ["卵", "牛乳"] };
    const b2 = { ...a, allergies: ["牛乳", "卵"] };
    expect(buildAdviceCacheKey(b1)).toBe(buildAdviceCacheKey(b2));
  });
});
