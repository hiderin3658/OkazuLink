// ai_advice_logs 等に保存する payload をサニタイズする。
//
// 守りたいもの:
// - 画像 base64 データ（巨大、無意味）
// - API key やアクセストークン（漏洩防止）
// - 過剰に大きな文字列（テーブル肥大防止）
//
// 純粋関数として実装し、vitest でテスト可能。

const MAX_STRING_LEN = 5000;
const MAX_ARRAY_LEN = 50;
const MAX_DEPTH = 6;

const KEY_PATTERNS: { regex: RegExp; replacement: string }[] = [
  // Google API Key
  { regex: /AIzaSy[A-Za-z0-9_-]{30,40}/g, replacement: "<GOOGLE_API_KEY>" },
  // Supabase access token
  { regex: /sbp_[A-Za-z0-9]{20,}/g, replacement: "<SUPABASE_ACCESS_TOKEN>" },
  // Generic Bearer token
  { regex: /Bearer\s+[A-Za-z0-9_.\-]{20,}/g, replacement: "Bearer <TOKEN>" },
  // JWT-ish (eyJ で始まる長い文字列)
  { regex: /eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/g, replacement: "<JWT>" },
];

/** 文字列内の機密値をマスクし、上限長で切り詰める */
export function maskString(s: string): string {
  let out = s;
  for (const p of KEY_PATTERNS) {
    out = out.replace(p.regex, p.replacement);
  }
  if (out.length > MAX_STRING_LEN) {
    out = `${out.slice(0, MAX_STRING_LEN)}…<truncated>`;
  }
  return out;
}

/** 任意の値（オブジェクト・配列含む）を再帰的にサニタイズする */
export function sanitizeForAiLog(value: unknown, depth = MAX_DEPTH): unknown {
  if (depth <= 0) return "<too-deep>";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return maskString(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    const limited = value.length > MAX_ARRAY_LEN ? value.slice(0, MAX_ARRAY_LEN) : value;
    const out = limited.map((v) => sanitizeForAiLog(v, depth - 1));
    if (value.length > MAX_ARRAY_LEN) {
      out.push(`<…${value.length - MAX_ARRAY_LEN} more items truncated>`);
    }
    return out;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      // 画像 base64 データは生データを残さず統計のみ保持
      if ((k === "data" || k === "imageData") && typeof v === "string" && v.length > 200) {
        out[k] = `<base64:${v.length}bytes>`;
        continue;
      }
      // API キー・シークレット系のフィールド名は値ごと削除
      if (/api_?key|secret|password|token/i.test(k)) {
        out[k] = "<REDACTED>";
        continue;
      }
      out[k] = sanitizeForAiLog(v, depth - 1);
    }
    return out;
  }
  // function や symbol 等の想定外は除外
  return undefined;
}
