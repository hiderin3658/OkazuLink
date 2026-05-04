import { describe, expect, it } from "vitest";
import {
  RecipeValidationError,
  validateRecipeSuggestions,
  validateRequestInput,
  VALID_CUISINES,
} from "./validate";

const minimalRecipe = {
  title: "豚しゃぶサラダ",
  cuisine: "japanese",
  description: "あっさり",
  servings: 1,
  time_minutes: 15,
  calories_kcal: 450,
  ingredients: [{ name: "豚ロース", amount: "100g", optional: false }],
  steps: ["豚を茹でる", "野菜と和える"],
};

describe("validateRecipeSuggestions", () => {
  it("正常な配列をそのまま返す", () => {
    const out = validateRecipeSuggestions([minimalRecipe]);
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe("豚しゃぶサラダ");
    expect(out[0]!.cuisine).toBe("japanese");
    expect(out[0]!.servings).toBe(1);
    expect(out[0]!.calories_kcal).toBe(450);
    expect(out[0]!.ingredients).toHaveLength(1);
    expect(out[0]!.steps).toHaveLength(2);
  });

  it("配列でない（オブジェクト直）はエラー", () => {
    expect(() => validateRecipeSuggestions({} as unknown)).toThrow(
      RecipeValidationError,
    );
  });

  it("{ recipes: [...] } 形式は 1 段降りて受け入れる", () => {
    const out = validateRecipeSuggestions({ recipes: [minimalRecipe] });
    expect(out).toHaveLength(1);
  });

  it("空配列はエラー", () => {
    expect(() => validateRecipeSuggestions([])).toThrow(/empty/i);
  });

  it("title が無いとエラー", () => {
    expect(() =>
      validateRecipeSuggestions([{ ...minimalRecipe, title: "" }]),
    ).toThrow(/title/);
  });

  it("不正な cuisine は other に丸める", () => {
    const out = validateRecipeSuggestions([
      { ...minimalRecipe, cuisine: "imaginary" },
    ]);
    expect(out[0]!.cuisine).toBe("other");
  });

  it("8 種類の cuisine すべて受け入れる", () => {
    for (const c of VALID_CUISINES) {
      const out = validateRecipeSuggestions([{ ...minimalRecipe, cuisine: c }]);
      expect(out[0]!.cuisine).toBe(c);
    }
  });

  it("servings が 0 や負値なら 1 にフォールバック", () => {
    expect(
      validateRecipeSuggestions([{ ...minimalRecipe, servings: 0 }])[0]!.servings,
    ).toBe(1);
    expect(
      validateRecipeSuggestions([{ ...minimalRecipe, servings: -2 }])[0]!.servings,
    ).toBe(1);
  });

  it("time_minutes が無効なら 30 にフォールバック", () => {
    expect(
      validateRecipeSuggestions([{ ...minimalRecipe, time_minutes: "abc" }])[0]!
        .time_minutes,
    ).toBe(30);
  });

  it("calories_kcal が null は許容、丸めて整数化", () => {
    expect(
      validateRecipeSuggestions([{ ...minimalRecipe, calories_kcal: null }])[0]!
        .calories_kcal,
    ).toBeNull();
    expect(
      validateRecipeSuggestions([{ ...minimalRecipe, calories_kcal: 450.7 }])[0]!
        .calories_kcal,
    ).toBe(451);
  });

  it("ingredients が空はエラー", () => {
    expect(() =>
      validateRecipeSuggestions([{ ...minimalRecipe, ingredients: [] }]),
    ).toThrow(/ingredients/);
  });

  it("ingredients[i].name が無いとエラー", () => {
    expect(() =>
      validateRecipeSuggestions([
        {
          ...minimalRecipe,
          ingredients: [{ name: "", amount: "100g", optional: false }],
        },
      ]),
    ).toThrow(/name/);
  });

  it("ingredients[i].amount が無ければ '適量'", () => {
    const out = validateRecipeSuggestions([
      {
        ...minimalRecipe,
        ingredients: [{ name: "豚ロース", optional: false }],
      },
    ]);
    expect(out[0]!.ingredients[0]!.amount).toBe("適量");
  });

  it("ingredients[i].optional が boolean 以外は false に正規化", () => {
    const out = validateRecipeSuggestions([
      {
        ...minimalRecipe,
        ingredients: [
          { name: "醤油", amount: "大さじ1", optional: "true" }, // string → false
          { name: "塩", amount: "少々", optional: true },
        ],
      },
    ]);
    expect(out[0]!.ingredients[0]!.optional).toBe(false);
    expect(out[0]!.ingredients[1]!.optional).toBe(true);
  });

  it("steps が配列でないとエラー", () => {
    expect(() =>
      validateRecipeSuggestions([{ ...minimalRecipe, steps: "茹でる" }]),
    ).toThrow(/steps/);
  });

  it("steps が空の場合エラー", () => {
    expect(() =>
      validateRecipeSuggestions([{ ...minimalRecipe, steps: [] }]),
    ).toThrow(/steps/);
  });

  it("steps の空文字 / 非文字列は除去（残りが 1 件以上あれば成功）", () => {
    const out = validateRecipeSuggestions([
      { ...minimalRecipe, steps: ["切る", "", null, 42, "  茹でる  "] },
    ]);
    expect(out[0]!.steps).toEqual(["切る", "茹でる"]);
  });

  it("複数レシピは順序を保つ", () => {
    const out = validateRecipeSuggestions([
      { ...minimalRecipe, title: "A" },
      { ...minimalRecipe, title: "B" },
      { ...minimalRecipe, title: "C" },
    ]);
    expect(out.map((r) => r.title)).toEqual(["A", "B", "C"]);
  });
});

// =====================================================================
// validateRequestInput: PR-C で追加した source 分岐対応の入力検証
// =====================================================================

describe("validateRequestInput", () => {
  it("source 未指定なら 'ai' として扱い、AI ルートのバリデートが効く", () => {
    const r = validateRequestInput({
      cuisine: "japanese",
      ingredients: ["豚ロース"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.clean.source).toBe("ai");
  });

  it("source='invalid' は BAD_REQUEST", () => {
    const r = validateRequestInput({
      source: "invalid",
      cuisine: "japanese",
      ingredients: ["x"],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("BAD_REQUEST");
      expect(r.reason).toContain("source");
    }
  });

  it("AI モード: ingredients 必須、空配列は BAD_REQUEST", () => {
    const r = validateRequestInput({
      source: "ai",
      cuisine: "japanese",
      ingredients: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("BAD_REQUEST");
  });

  it("AI モード: ingredients が 50 件超は BAD_REQUEST", () => {
    const r = validateRequestInput({
      source: "ai",
      cuisine: "japanese",
      ingredients: Array.from({ length: 51 }, (_, i) => `food-${i}`),
    });
    expect(r.ok).toBe(false);
  });

  it("AI モード: servings は 1〜20 にクランプ", () => {
    const tooSmall = validateRequestInput({
      cuisine: "japanese",
      ingredients: ["a"],
      servings: 0,
    });
    expect(tooSmall.ok).toBe(true);
    if (tooSmall.ok && tooSmall.clean.source === "ai") {
      expect(tooSmall.clean.servings).toBe(1);
    }
    const tooLarge = validateRequestInput({
      cuisine: "japanese",
      ingredients: ["a"],
      servings: 99,
    });
    if (tooLarge.ok && tooLarge.clean.source === "ai") {
      expect(tooLarge.clean.servings).toBe(20);
    }
  });

  it("AI モード: candidateCount は 1〜8 にクランプ、未指定なら 4", () => {
    const def = validateRequestInput({
      cuisine: "japanese",
      ingredients: ["a"],
    });
    if (def.ok && def.clean.source === "ai") {
      expect(def.clean.candidateCount).toBe(4);
    }
    const max = validateRequestInput({
      cuisine: "japanese",
      ingredients: ["a"],
      candidateCount: 99,
    });
    if (max.ok && max.clean.source === "ai") {
      expect(max.clean.candidateCount).toBe(8);
    }
  });

  it("AI モード: profile は allergies/disliked を string 配列に整形", () => {
    const r = validateRequestInput({
      cuisine: "japanese",
      ingredients: ["a"],
      profile: {
        allergies: ["卵", "小麦", 123, null] as unknown as string[],
        disliked: ["パクチー"],
        goal_type: "diet",
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.clean.source === "ai") {
      expect(r.clean.profile.allergies).toEqual(["卵", "小麦"]);
      expect(r.clean.profile.disliked).toEqual(["パクチー"]);
      expect(r.clean.profile.goal_type).toBe("diet");
    }
  });

  it("楽天モード: cuisine 必須、ingredients/profile/servings は無視される", () => {
    const r = validateRequestInput({
      source: "rakuten",
      cuisine: "japanese",
      ingredients: ["不要な値"], // 無視されるべき
      servings: 99, // 同上
      profile: { allergies: ["x"] }, // 同上
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.clean.source).toBe("rakuten");
      expect(r.clean.cuisine).toBe("japanese");
      // ingredients / servings / profile は楽天モードの clean には含まれない
      expect("ingredients" in r.clean).toBe(false);
      expect("servings" in r.clean).toBe(false);
      expect("profile" in r.clean).toBe(false);
    }
  });

  it("楽天モード: candidateCount 未指定 → 4、99 → 4 にクランプ、0 → 1 にクランプ", () => {
    const def = validateRequestInput({ source: "rakuten", cuisine: "chinese" });
    if (def.ok) expect(def.clean.candidateCount).toBe(4);

    const max = validateRequestInput({
      source: "rakuten",
      cuisine: "chinese",
      candidateCount: 99,
    });
    if (max.ok) expect(max.clean.candidateCount).toBe(4);

    const zero = validateRequestInput({
      source: "rakuten",
      cuisine: "chinese",
      candidateCount: 0,
    });
    if (zero.ok) expect(zero.clean.candidateCount).toBe(1);
  });

  it("楽天モード: cuisine 不正は BAD_REQUEST", () => {
    const r = validateRequestInput({
      source: "rakuten",
      cuisine: "unknown",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("BAD_REQUEST");
  });

  it("AI モード: 全 cuisine が VALID_CUISINES 値を受け付ける", () => {
    for (const c of VALID_CUISINES) {
      const r = validateRequestInput({
        source: "ai",
        cuisine: c,
        ingredients: ["x"],
      });
      expect(r.ok).toBe(true);
      if (r.ok && r.clean.source === "ai") {
        expect(r.clean.cuisine).toBe(c);
      }
    }
  });
});
