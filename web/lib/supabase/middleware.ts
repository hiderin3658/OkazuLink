import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

const PUBLIC_PATHS = ["/login", "/api/auth"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  // /api/* は認証失敗時に redirect ではなく JSON 401 を返す。
  // ページ系の redirect だと fetch がデフォルトで follow して 200 (HTML)
  // を返してしまい、API クライアントが認証エラーを判定できなくなる。
  const isApi = pathname.startsWith("/api/");

  if (!user && !isPublic) {
    if (isApi) {
      return jsonUnauthorized(supabaseResponse);
    }
    return redirectPreservingCookies(request, "/login", null, supabaseResponse);
  }

  if (user && !isPublic) {
    // ホワイトリスト検証（RLS でも守られているが early reject で UX 改善）
    // DB 側は小文字で保存しているため lowercase で比較する
    const { data: allowed } = await supabase
      .from("allowed_users")
      .select("id")
      .eq("email", (user.email ?? "").toLowerCase())
      .maybeSingle();

    if (!allowed) {
      await supabase.auth.signOut();
      if (isApi) {
        return jsonUnauthorized(supabaseResponse, "Not in allowlist");
      }
      return redirectPreservingCookies(
        request,
        "/login",
        { error: "not_allowed" },
        supabaseResponse,
      );
    }
  }

  return supabaseResponse;
}

/**
 * /api/* 向けの 401 JSON レスポンス。
 * supabaseResponse の cookie（signOut 等で更新されたもの）を引き継ぐ。
 */
function jsonUnauthorized(
  source: NextResponse,
  message = "Unauthorized",
): NextResponse {
  const res = new NextResponse(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
  source.cookies.getAll().forEach((c) => {
    res.cookies.set(c.name, c.value, c);
  });
  return res;
}

/**
 * Supabase が cookie を書き込んだ supabaseResponse を保ったまま redirect する。
 * 直接 NextResponse.redirect() を返すと、signOut() 等で更新された cookie が client に伝わらない。
 */
function redirectPreservingCookies(
  request: NextRequest,
  pathname: string,
  params: Record<string, string> | null,
  source: NextResponse,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const redirect = NextResponse.redirect(url);
  source.cookies.getAll().forEach((c) => {
    redirect.cookies.set(c.name, c.value, c);
  });
  return redirect;
}
