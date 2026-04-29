import { describe, expect, it } from "vitest";
import { sha256Hex } from "./hash";

describe("sha256Hex", () => {
  it("空文字は SHA-256 標準ハッシュ", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("'abc' の SHA-256 ハッシュは標準値と一致", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("64 文字の hex 文字列を返す", async () => {
    const h = await sha256Hex("OkazuLink");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("同じ入力なら同じ出力", async () => {
    const a = await sha256Hex("test");
    const b = await sha256Hex("test");
    expect(a).toBe(b);
  });

  it("異なる入力なら異なる出力", async () => {
    const a = await sha256Hex("test");
    const b = await sha256Hex("Test");
    expect(a).not.toBe(b);
  });

  it("日本語入力も正しくハッシュ化", async () => {
    const h = await sha256Hex("和食 豚ロース 玉ねぎ");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
