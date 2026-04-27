// Edge Function 用認証ヘルパー
//
// Authorization: Bearer <jwt> ヘッダから JWT を取り出し、Supabase Auth で検証。
// 加えて allowed_users ホワイトリストでも確認する（middleware と同じセキュリティ層）。
//
// このモジュールは Supabase JS SDK に依存するため vitest からは import しない。
// テストは Edge Function の統合テスト (supabase functions serve) で行う。

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { EdgeError } from "./types";

interface AuthOk {
  ok: true;
  userId: string;
  email: string;
  /** authenticated user の JWT で動作する supabase client（RLS 適用） */
  supabase: SupabaseClient;
}
interface AuthErr {
  ok: false;
  error: EdgeError;
  status: number;
}
export type AuthResult = AuthOk | AuthErr;

/** Edge Function の標準認証チェック。
 *  必要 env: SUPABASE_URL, SUPABASE_ANON_KEY */
export async function authenticate(req: Request): Promise<AuthResult> {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) {
    return {
      ok: false,
      status: 401,
      error: {
        error: "Missing Authorization header",
        code: "AUTH_MISSING_TOKEN",
      },
    };
  }
  const token = m[1]!;

  const supabaseUrl = mustEnv("SUPABASE_URL");
  const anonKey = mustEnv("SUPABASE_ANON_KEY");

  // ユーザー JWT で動作する client を作る（RLS が効く）
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user || !user.email) {
    return {
      ok: false,
      status: 401,
      error: {
        error: "Invalid JWT or no email",
        code: "AUTH_INVALID_TOKEN",
        detail: error?.message,
      },
    };
  }

  // ホワイトリスト確認（DB 側も lower(email) で正規化済）
  const emailLower = user.email.toLowerCase();
  const { data: allowed, error: listErr } = await supabase
    .from("allowed_users")
    .select("role")
    .eq("email", emailLower)
    .maybeSingle();
  if (listErr) {
    return {
      ok: false,
      status: 500,
      error: { error: "allowed_users lookup failed", code: "AUTH_DB_ERROR", detail: listErr.message },
    };
  }
  if (!allowed) {
    return {
      ok: false,
      status: 403,
      error: { error: "Not in allowlist", code: "AUTH_NOT_ALLOWED" },
    };
  }

  return { ok: true, userId: user.id, email: emailLower, supabase };
}

/** service_role キーで動作する Supabase クライアントを作る。
 *  RLS をバイパスして DB に書き込む用途（ai_advice_logs / recipes 等）。
 *  この返却を絶対にクライアント JWT 由来の supabase と混在させないこと。 */
export function createServiceClient(): SupabaseClient {
  const url = mustEnv("SUPABASE_URL");
  const key = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function mustEnv(name: string): string {
  // Deno と Node の両方で動くように globalThis 経由でアクセス
  const v =
    (globalThis as { Deno?: { env: { get: (k: string) => string | undefined } } }).Deno?.env.get(name) ??
    (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env?.[name];
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}
