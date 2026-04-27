import { describe, expect, it } from "vitest";
import {
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
