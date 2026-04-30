// ファイル名として安全な slug かどうかを検証する純粋関数
//
// generate.ts でファイルパスを組み立てる前に呼ぶ。data.ts の slug は固定値だが、
// 将来動的入力になった場合のパストラバーサル（"../" 等）対策として独立して
// テスト可能にする。

const SAFE_SLUG_RE = /^[a-zA-Z0-9_-]+$/;

export function isSafeSlug(slug: string): boolean {
  return SAFE_SLUG_RE.test(slug);
}

export function assertSafeSlug(slug: string): void {
  if (!isSafeSlug(slug)) {
    throw new Error(
      `Unsafe slug rejected: "${slug}" (must match ${SAFE_SLUG_RE.source})`,
    );
  }
}
