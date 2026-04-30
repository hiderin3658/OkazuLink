import { describe, expect, it } from "vitest";
import { assertSafeSlug, isSafeSlug } from "./safe-slug";

describe("isSafeSlug", () => {
  it("英数字とハイフン・アンダースコアのみは true", () => {
    expect(isSafeSlug("20260312-maruhachi")).toBe(true);
    expect(isSafeSlug("test_slug")).toBe(true);
    expect(isSafeSlug("abc123")).toBe(true);
  });

  it("空文字は false", () => {
    expect(isSafeSlug("")).toBe(false);
  });

  it("パストラバーサル文字を含む slug は false", () => {
    expect(isSafeSlug("../etc/passwd")).toBe(false);
    expect(isSafeSlug("../../foo")).toBe(false);
    expect(isSafeSlug("/absolute/path")).toBe(false);
    expect(isSafeSlug("foo/bar")).toBe(false);
  });

  it("空白や特殊文字を含む slug は false", () => {
    expect(isSafeSlug("foo bar")).toBe(false);
    expect(isSafeSlug("foo.bar")).toBe(false);
    expect(isSafeSlug("foo:bar")).toBe(false);
  });

  it("日本語を含む slug は false（ファイル名トラブル回避）", () => {
    expect(isSafeSlug("レシート")).toBe(false);
  });
});

describe("assertSafeSlug", () => {
  it("安全な slug は何も throw しない", () => {
    expect(() => assertSafeSlug("20260312-maruhachi")).not.toThrow();
  });

  it("危険な slug は Error を throw", () => {
    expect(() => assertSafeSlug("../etc/passwd")).toThrow(/Unsafe slug/);
    expect(() => assertSafeSlug("foo/bar")).toThrow();
    expect(() => assertSafeSlug("")).toThrow();
  });
});
