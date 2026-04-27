// CORS ヘッダー
//
// Next.js (Vercel) → Supabase Edge Function を fetch する想定。
// Vercel ドメインは複数ありうるため、本プロジェクトでは ALLOWED_ORIGIN 環境変数で
// 厳密制御するか、開発時のみ "*" を返す運用にする。

const DEFAULT_ALLOWED_ORIGIN = "*";

/** Preflight 含む共通 CORS ヘッダーを返す */
export function corsHeaders(origin?: string): Record<string, string> {
  const allowed = origin ?? DEFAULT_ALLOWED_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

/** Preflight (OPTIONS) リクエストにそのまま返せる Response */
export function preflightResponse(origin?: string): Response {
  return new Response("ok", {
    status: 200,
    headers: corsHeaders(origin),
  });
}

/** JSON レスポンスを返すヘルパー（CORS ヘッダ自動付与） */
export function jsonResponse<T>(
  body: T,
  init: { status?: number; origin?: string } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      ...corsHeaders(init.origin),
      "Content-Type": "application/json",
    },
  });
}
