// hello: Edge Function 疎通確認用のスモークテスト
//
// 使い方（ローカル）:
//   supabase functions serve hello --env-file ./supabase/functions/.env
//
// 確認:
//   curl -X POST http://localhost:54321/functions/v1/hello \
//     -H "Authorization: Bearer <user-jwt>" \
//     -H "Content-Type: application/json" \
//     -d '{"name":"Hideki"}'
//
// 期待レスポンス: { "message": "Hello, Hideki!", "user": "<email>" }

import { authenticate } from "../_shared/auth.ts";
import { jsonResponse, preflightResponse } from "../_shared/cors.ts";

interface RequestBody {
  name?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return preflightResponse();
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  const authResult = await authenticate(req);
  if (!authResult.ok) {
    return jsonResponse(authResult.error, { status: authResult.status });
  }

  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    // 空ボディは許容
  }

  const name = body.name?.trim() || "world";
  return jsonResponse({
    message: `Hello, ${name}!`,
    user: authResult.email,
    timestamp: new Date().toISOString(),
  });
});
