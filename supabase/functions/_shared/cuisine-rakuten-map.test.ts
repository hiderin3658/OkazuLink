import { describe, expect, it } from "vitest";
import {
  CUISINE_TO_RAKUTEN_CATEGORY,
  SUPPORTED_CUISINES,
  isSupportedCuisine,
  rakutenCategoryFor,
} from "./cuisine-rakuten-map";

describe("CUISINE_TO_RAKUTEN_CATEGORY", () => {
  it("8 種すべての cuisine をカバーする", () => {
    expect(Object.keys(CUISINE_TO_RAKUTEN_CATEGORY).sort()).toEqual(
      [...SUPPORTED_CUISINES].sort(),
    );
  });

  it("各 categoryId は数字文字列のみ（楽天 API 仕様）", () => {
    for (const id of Object.values(CUISINE_TO_RAKUTEN_CATEGORY)) {
      expect(id).toMatch(/^\d+$/);
    }
  });

  it("categoryId に重複がない（誤マッピング防止）", () => {
    const ids = Object.values(CUISINE_TO_RAKUTEN_CATEGORY);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("rakutenCategoryFor", () => {
  it("対応 cuisine は categoryId 文字列を返す", () => {
    expect(rakutenCategoryFor("japanese")).toBe("27");
    expect(rakutenCategoryFor("chinese")).toBe("28");
    expect(rakutenCategoryFor("italian")).toBe("29");
    expect(rakutenCategoryFor("french")).toBe("30");
    expect(rakutenCategoryFor("ethnic")).toBe("31");
    expect(rakutenCategoryFor("korean")).toBe("32");
    expect(rakutenCategoryFor("sweets")).toBe("21");
    expect(rakutenCategoryFor("other")).toBe("33");
  });

  it("未対応 cuisine は null を返す", () => {
    expect(rakutenCategoryFor("unknown")).toBeNull();
    expect(rakutenCategoryFor("")).toBeNull();
    expect(rakutenCategoryFor("Japanese")).toBeNull(); // 大文字は別物
  });
});

describe("isSupportedCuisine", () => {
  it("正しい cuisine は true", () => {
    expect(isSupportedCuisine("japanese")).toBe(true);
    expect(isSupportedCuisine("sweets")).toBe(true);
  });

  it("不正な値は false", () => {
    expect(isSupportedCuisine("unknown")).toBe(false);
    expect(isSupportedCuisine("")).toBe(false);
  });
});
