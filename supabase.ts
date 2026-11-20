import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

// Public values (safe to expose; protected by Row Level Security). Env vars
// win; the fallbacks keep the site on Supabase if the env file is ever reset.
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  "https://zicbstulzftkctlyhlnc.supabase.co";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  "sb_publishable_3mau6oQUX_bN21KpckZUww_f7jnGkp4";

export const getSupabaseUrl = () => url;
export const getSupabaseAnonKey = () => anonKey;

/** True when the Supabase URL + public (anon/publishable) key are present. */
export const isSupabaseConfigured = () => Boolean(url && anonKey);

/**
 * Per-request server client bound to the browser's auth cookies.
 * All data access goes through the signed-in user's own session and is
 * protected by Row Level Security — no secret key is needed.
 */
export async function createServerSupabase(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const h = await headers();
  const proto = (h.get("x-forwarded-proto") || "").split(",")[0].trim();
  const isHttps = proto === "https";
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, {
              ...options,
              // Works inside embedded previews (iframes) over HTTPS.
              ...(isHttps ? { sameSite: "none" as const, secure: true } : {}),
            })
          );
        } catch {
          // called from a Server Component; cookies are handled elsewhere
        }
      },
    },
  });
}

/** Client that acts as the user identified by a given access token (JWT). */
export function createTokenSupabase(token: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * Best client for the current request: the cookie session if there is one,
 * otherwise the ?t= access token (used when the browser blocks cookies).
 */
export async function getRequestSupabase(token?: string | null): Promise<SupabaseClient> {
  if (token) {
    const tc = createTokenSupabase(token);
    const r = await tc.auth.getUser(token);
    if (r.data.user) return tc;
  }
  const supabase = await createServerSupabase();
  return supabase;
}

/** Current access token (JWT) for building ?t= deep links. */
export async function getSupabaseAccessToken(): Promise<string> {
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || "";
  } catch {
    return "";
  }
}
