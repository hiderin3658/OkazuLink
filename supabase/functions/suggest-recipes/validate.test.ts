import { describe, expect, it } from "vitest";
import {
  RecipeValidationError,
  validateRecipeSuggestions,
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
