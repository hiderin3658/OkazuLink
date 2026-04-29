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
});
