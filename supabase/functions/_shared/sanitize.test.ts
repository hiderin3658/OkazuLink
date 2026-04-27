import { describe, expect, it } from "vitest";
import { maskString, sanitizeForAiLog } from "./sanitize";

describe("maskString", () => {
  it("Google API key (AIzaSy で始まる) をマスク", () => {
    const s = "key: AIzaSyAbcdefghijklmnopqrstuvwxyz12345 ok";
    expect(maskString(s)).toBe("key: <GOOGLE_API_KEY> ok");
  });

  it("sbp_ で始まる Supabase access token をマスク", () => {
    expect(maskString("token=sbp_541a2cc12405707c002fd9001229f710e5b5c5bf done")).toBe(
      "token=<SUPABASE_ACCESS_TOKEN> done",
    );
  });

  it("Bearer トークンをマスク", () => {
    expect(maskString("Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def")).toContain("<TOKEN>");
  });

  it("JWT 形式（3 区切りの長い文字列）をマスク", () => {
    const jwt = "eyJabcdefghij.eyJpayloadlong.signaturelong";
    const out = maskString(jwt);
    expect(out).toContain("<JWT>");
  });

  it("通常の文字列はそのまま", () => {
    expect(maskString("hello world")).toBe("hello world");
  });

  it("非常に長い文字列は切り詰め", () => {
    const long = "a".repeat(6000);
    const out = maskString(long);
    expect(out.length).toBeLessThanOrEqual(5100);
    expect(out).toContain("truncated");
  });
});

describe("sanitizeForAiLog", () => {
  it("プリミティブはそのまま", () => {
    expect(sanitizeForAiLog(42)).toBe(42);
    expect(sanitizeForAiLog(true)).toBe(true);
    expect(sanitizeForAiLog(null)).toBeNull();
    expect(sanitizeForAiLog(undefined)).toBeUndefined();
  });

  it("文字列内のキーはマスク", () => {
    expect(sanitizeForAiLog("AIzaSyAbcdefghijklmnopqrstuvwxyz1234567890")).toContain("<GOOGLE_API_KEY>");
  });

  it("配列内の各要素をサニタイズ", () => {
    const out = sanitizeForAiLog(["AIzaSyAbcdefghijklmnopqrstuvwxyz1234567890", "ok"]);
    expect(Array.isArray(out)).toBe(true);
    expect((out as string[])[0]).toContain("<GOOGLE_API_KEY>");
    expect((out as string[])[1]).toBe("ok");
  });

  it("配列が長すぎる場合は切り詰め", () => {
    const arr = Array.from({ length: 100 }, (_, i) => i);
    const out = sanitizeForAiLog(arr) as unknown[];
    expect(out.length).toBe(51); // 50 elements + 1 truncation marker
    expect(out[50]).toMatch(/truncated/);
  });

  it("オブジェクトの api_key / secret / token フィールドは値ごと削除", () => {
    const out = sanitizeForAiLog({
      api_key: "AIzaSyAbcdefghijklmnopqrstuvwxyz1234567890",
      apiKey: "secret_value",
      authToken: "abc",
      password: "p@ss",
      normal: "ok",
    }) as Record<string, unknown>;
    expect(out.api_key).toBe("<REDACTED>");
    expect(out.apiKey).toBe("<REDACTED>");
    expect(out.authToken).toBe("<REDACTED>");
    expect(out.password).toBe("<REDACTED>");
    expect(out.normal).toBe("ok");
  });

  it("画像 base64 (data フィールドの長文字列) は size 要約に置換", () => {
    const data = "A".repeat(500);
    const out = sanitizeForAiLog({
      inlineData: { mimeType: "image/jpeg", data },
    }) as { inlineData: { data: string } };
    expect(out.inlineData.data).toBe("<base64:500bytes>");
  });

  it("imageData フィールドも同じく要約", () => {
    const out = sanitizeForAiLog({
      imageData: "A".repeat(300),
    }) as { imageData: string };
    expect(out.imageData).toBe("<base64:300bytes>");
  });

  it("data フィールドが短い場合はマスクされない（画像とは限らないため）", () => {
    const out = sanitizeForAiLog({ data: "short" }) as { data: string };
    expect(out.data).toBe("short");
  });

  it("深いネストは <too-deep> に切り詰め", () => {
    let nested: Record<string, unknown> = { v: "deep" };
    for (let i = 0; i < 10; i++) nested = { child: nested };
    const out = sanitizeForAiLog(nested) as Record<string, unknown>;
    // 6 階層降りたあとは <too-deep>
    let cur: Record<string, unknown> = out;
    for (let i = 0; i < 5 && cur.child; i++) cur = cur.child as Record<string, unknown>;
    expect(JSON.stringify(out)).toContain("<too-deep>");
  });

  it("関数やシンボルは undefined に", () => {
    const out = sanitizeForAiLog({
      fn: () => 1,
      sym: Symbol("x"),
    }) as Record<string, unknown>;
    expect(out.fn).toBeUndefined();
    expect(out.sym).toBeUndefined();
  });
});
