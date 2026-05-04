import { describe, expect, it } from "vitest";
import { userProfileInputSchema } from "./schema";

describe("userProfileInputSchema", () => {
  it("最小入力（全空）でも成功", () => {
    const out = userProfileInputSchema.safeParse({});
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data.display_name).toBeNull();
      expect(out.data.goal_type).toBeNull();
      expect(out.data.allergies).toEqual([]);
      expect(out.data.disliked_foods).toEqual([]);
    }
  });

  it("通常の入力をパース", () => {
    const out = userProfileInputSchema.safeParse({
      display_name: "ハナコ",
      goal_type: "diet",
      allergies: ["卵", "牛乳"],
      disliked_foods: ["パクチー"],
    });
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data.display_name).toBe("ハナコ");
      expect(out.data.goal_type).toBe("diet");
      expect(out.data.allergies).toEqual(["卵", "牛乳"]);
    }
  });

  it("display_name は空文字なら null に正規化", () => {
    const out = userProfileInputSchema.safeParse({ display_name: "" });
    expect(out.success).toBe(true);
    if (out.success) expect(out.data.display_name).toBeNull();
  });

  it("display_name 50 文字超でエラー", () => {
    const out = userProfileInputSchema.safeParse({
      display_name: "あ".repeat(51),
    });
    expect(out.success).toBe(false);
  });

  it("不正な goal_type はエラー", () => {
    const out = userProfileInputSchema.safeParse({ goal_type: "imaginary" });
    expect(out.success).toBe(false);
  });

  it("goal_type が空文字なら null に正規化", () => {
    const out = userProfileInputSchema.safeParse({ goal_type: "" });
    expect(out.success).toBe(true);
    if (out.success) expect(out.data.goal_type).toBeNull();
  });

  it("allergies はトリムされる", () => {
    const out = userProfileInputSchema.safeParse({
      allergies: ["  卵  ", "牛乳"],
    });
    expect(out.success).toBe(true);
    if (out.success) expect(out.data.allergies).toEqual(["卵", "牛乳"]);
  });

  it("空文字を含む allergies はエラー", () => {
    const out = userProfileInputSchema.safeParse({ allergies: ["卵", ""] });
    expect(out.success).toBe(false);
  });

  it("31 件以上の allergies はエラー", () => {
    const arr = Array.from({ length: 31 }, (_, i) => `tag${i}`);
    const out = userProfileInputSchema.safeParse({ allergies: arr });
    expect(out.success).toBe(false);
  });

  it("31 文字以上のタグはエラー", () => {
    const out = userProfileInputSchema.safeParse({
      allergies: ["a".repeat(31)],
    });
    expect(out.success).toBe(false);
  });

  // Phase 2 追加: birth_year / height_cm / target_weight_kg
  it("birth_year 未指定は null", () => {
    const out = userProfileInputSchema.safeParse({});
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data.birth_year).toBeNull();
      expect(out.data.height_cm).toBeNull();
      expect(out.data.target_weight_kg).toBeNull();
    }
  });

  it("birth_year 数値・文字列の両方を受け入れる", () => {
    expect(userProfileInputSchema.safeParse({ birth_year: 1990 })).toMatchObject({
      success: true,
      data: { birth_year: 1990 },
    });
    expect(userProfileInputSchema.safeParse({ birth_year: "1990" })).toMatchObject({
      success: true,
      data: { birth_year: 1990 },
    });
  });

  it("birth_year 空文字は null", () => {
    const out = userProfileInputSchema.safeParse({ birth_year: "" });
    expect(out.success).toBe(true);
    if (out.success) expect(out.data.birth_year).toBeNull();
  });

  it("birth_year 1899 はエラー（1900 以上）", () => {
    expect(
      userProfileInputSchema.safeParse({ birth_year: 1899 }).success,
    ).toBe(false);
  });

  it("birth_year は未来年エラー", () => {
    const future = new Date().getFullYear() + 1;
    expect(
      userProfileInputSchema.safeParse({ birth_year: future }).success,
    ).toBe(false);
  });

  it("birth_year 小数はエラー", () => {
    expect(
      userProfileInputSchema.safeParse({ birth_year: 1990.5 }).success,
    ).toBe(false);
  });

  it("birth_year 不正値はエラー", () => {
    expect(
      userProfileInputSchema.safeParse({ birth_year: "abc" }).success,
    ).toBe(false);
  });

  it("height_cm 範囲外（49 以下 / 251 以上）はエラー", () => {
    expect(userProfileInputSchema.safeParse({ height_cm: 49 }).success).toBe(false);
    expect(userProfileInputSchema.safeParse({ height_cm: 251 }).success).toBe(false);
  });

  it("height_cm 小数 OK（160.5）", () => {
    const out = userProfileInputSchema.safeParse({ height_cm: 160.5 });
    expect(out.success).toBe(true);
    if (out.success) expect(out.data.height_cm).toBe(160.5);
  });

  it("target_weight_kg 範囲外はエラー", () => {
    expect(
      userProfileInputSchema.safeParse({ target_weight_kg: 19 }).success,
    ).toBe(false);
    expect(
      userProfileInputSchema.safeParse({ target_weight_kg: 301 }).success,
    ).toBe(false);
  });

  it("3 つの数値項目を一括設定できる", () => {
    const out = userProfileInputSchema.safeParse({
      birth_year: 1990,
      height_cm: 160,
      target_weight_kg: 55,
    });
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data.birth_year).toBe(1990);
      expect(out.data.height_cm).toBe(160);
      expect(out.data.target_weight_kg).toBe(55);
    }
  });

  // P-14: default_recipe_source
  it("default_recipe_source 未指定は 'ai' にデフォルト", () => {
    const out = userProfileInputSchema.safeParse({});
    expect(out.success).toBe(true);
    if (out.success) expect(out.data.default_recipe_source).toBe("ai");
  });

  it("default_recipe_source = 'rakuten' を受け入れる", () => {
    const out = userProfileInputSchema.safeParse({
      default_recipe_source: "rakuten",
    });
    expect(out.success).toBe(true);
    if (out.success) expect(out.data.default_recipe_source).toBe("rakuten");
  });

  it("default_recipe_source の無効値はエラー", () => {
    const out = userProfileInputSchema.safeParse({
      default_recipe_source: "cookpad",
    });
    expect(out.success).toBe(false);
  });
});
