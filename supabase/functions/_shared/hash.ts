// SHA-256 ハッシュヘルパー
//
// recipes.generated_prompt_hash の生成に使う。
// Web Crypto API は Deno (Edge Function) と Node 18+ (vitest) の両方で
// グローバル提供されるため、追加依存なしで動作する。

/** 入力文字列を SHA-256 で hex digest 化する。長さ 64 文字。 */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  const hex: string[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    hex[i] = bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex.join("");
}
