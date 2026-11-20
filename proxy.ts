import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  "https://zicbstulzftkctlyhlnc.supabase.co";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  "sb_publishable_3mau6oQUX_bN21KpckZUww_f7jnGkp4";

/**
 * Keeps the Supabase login fresh on every request. If the access token has
 * expired, it is refreshed here and the new cookie is saved to the browser,
 * so pages and API calls (like Approve) never see a stale session.
 */
export async function proxy(request: NextRequest) {
  const hasSession = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!hasSession) return NextResponse.next();

  const proto = (request.headers.get("x-forwarded-proto") || "")
    .split(",")[0]
    .trim();
  const isHttps = proto === "https";

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, {
            ...options,
            ...(isHttps ? { sameSite: "none" as const, secure: true } : {}),
          })
        );
      },
    },
  });

  try {
    await supabase.auth.getUser();
  } catch {
    // never block the request because of a refresh problem
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
