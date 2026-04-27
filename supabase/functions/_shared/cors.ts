// CORS ヘッダー
//
// Next.js (Vercel) → Supabase Edge Function を fetch する想定。
//
// 本番では ALLOWED_ORIGIN 環境変数で Vercel ドメイン等を厳密制御する。
// ローカル開発では未設定なら "*" を許す（Supabase CLI の cli.serve も同様）。

import { getEnv } from "./env.ts";

/** ALLOWED_ORIGIN env が設定されていればそれを採用、なければ "*" を返す */
export function getAllowedOrigin(override?: string): string {
  if (override) return override;
  const fromEnv = getEnv("ALLOWED_ORIGIN");
  return fromEnv && fromEnv.length > 0 ? fromEnv : "*";
}

/** Preflight 含む共通 CORS ヘッダーを返す */
export function corsHeaders(origin?: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(origin),
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
