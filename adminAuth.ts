import { cookies, headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyAdminToken } from "@/lib/token";
import {
  isSupabaseConfigured,
  createServerSupabase,
  createTokenSupabase,
} from "@/lib/supabase";
import { fetchSupabaseProfile } from "@/lib/supabaseData";

export type AdminCheck =
  | { client: SupabaseClient; reason: "ok" }
  | { client: null; reason: "no_session" | "not_admin" | "token_invalid" };

/**
 * Supabase mode: return a client that is signed in as an ADMIN (or the reason
 * it isn't). Accepts the browser's login cookie OR an explicit access token
 * (request body field, `Authorization: Bearer ...`, or `x-admin-token`).
 */
export async function checkAdminSupabase(bodyToken?: string | null): Promise<AdminCheck> {
  let sawSession = false;

  // 1) cookie session
  try {
    const sb = await createServerSupabase();
    const { data } = await sb.auth.getUser();
    if (data.user) {
      sawSession = true;
      const profile = await fetchSupabaseProfile(sb, data.user.id, data.user.email || "");
      if (profile?.isAdmin) return { client: sb, reason: "ok" };
    }
  } catch {
    // fall through to token
  }

  // 2) explicit access token(s): request body first, then headers.
  const candidates: string[] = [];
  const addCandidate = (v?: string | null) => {
    const t = (v || "").replace(/^Bearer\s+/i, "").trim();
    if (t && !candidates.includes(t)) candidates.push(t);
  };
  addCandidate(bodyToken);
  try {
    const h = await headers();
    addCandidate(h.get("authorization"));
    addCandidate(h.get("x-admin-token"));
  } catch {
    // headers unavailable; rely on the body token
  }

  const sawToken = candidates.length > 0;
  for (const token of candidates) {
    try {
      const tc = createTokenSupabase(token);
      const { data } = await tc.auth.getUser(token);
      if (data.user) {
        sawSession = true;
        const profile = await fetchSupabaseProfile(tc, data.user.id, data.user.email || "");
        if (profile?.isAdmin) return { client: tc, reason: "ok" };
      }
    } catch {
      // try the next candidate
    }
  }

  if (sawSession) return { client: null, reason: "not_admin" };
  return { client: null, reason: sawToken ? "token_invalid" : "no_session" };
}

export async function getAdminSupabase(bodyToken?: string | null): Promise<SupabaseClient | null> {
  return (await checkAdminSupabase(bodyToken)).client;
}

/**
 * Is the current request from an admin?
 * - Supabase mode: signed-in user whose profile has is_admin = true.
 * - Local mode: vp_admin cookie (password login) or x-admin-token header.
 */
export async function isAdminSession(): Promise<boolean> {
  if (isSupabaseConfigured()) {
    return (await getAdminSupabase()) !== null;
  }
  try {
    const cookieStore = await cookies();
    if (cookieStore.get("vp_admin")?.value === "1") return true;
  } catch {
    // cookies not available
  }
  try {
    const h = await headers();
    const tok =
      h.get("x-admin-token") ||
      h.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      null;
    if (verifyAdminToken(tok)) return true;
  } catch {
    // headers not available
  }
  return false;
}

/** Backwards-compatible alias. */
export const isAdmin = isAdminSession;
