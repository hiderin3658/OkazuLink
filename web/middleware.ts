import type { NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Supabase cookie の更新のため、ほぼ全リクエストで実行する。
  // ただし静的アセットと /api/auth/* は除外（OAuth コールバックの cookie 設定を妨げない）。
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
