import { cookies, headers } from "next/headers";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { verifyUserToken, signUserToken } from "@/lib/token";
import {
  isSupabaseConfigured,
  createServerSupabase,
  createTokenSupabase,
  getSupabaseAccessToken,
} from "@/lib/supabase";

const COOKIE_NAME = "vp_session";

export type SessionUser = {
  id: string | number;
  fullName: string;
  email: string;
  phone: string;
  country: string;
  countryFlag: string;
  currency: string;
  registrationStatus: string;
  activePlan: string;
  planStatus: string;
  pendingPlan: string | null;
  avatarInitial: string | null;
  isAdmin: boolean;
  isAgent?: boolean;
  createdAt?: Date | string | null;
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Cookie options that also work when the app is embedded in an iframe over HTTPS. */
export async function cookieOptions(maxAge: number) {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "";
  const isHttps = proto.split(",")[0].trim() === "https";
  return {
    httpOnly: true,
    path: "/",
    sameSite: (isHttps ? "none" : "lax") as "none" | "lax",
    secure: isHttps,
    maxAge,
  };
}

export async function createSession(userId: number) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, String(userId), await cookieOptions(60 * 60 * 24 * 30));
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", await cookieOptions(0));
}

/** Admin emails (comma separated) for the local-fallback mode. */
export function adminEmailList(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isLocalAdminEmail(email: string): boolean {
  return adminEmailList().includes(String(email).toLowerCase());
}

/* ------------------------------ Supabase ------------------------------ */

import { fetchSupabaseProfile } from "@/lib/supabaseData";

/** Current user from the Supabase session cookie, or null. */
export async function getSupabaseCurrentUser(): Promise<SessionUser | null> {
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user) return null;
    return await fetchSupabaseProfile(supabase, user.id, user.email || "");
  } catch {
    return null;
  }
}

/* -------------------------------- Local ------------------------------- */

export async function getUserById(id: number) {
  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!user) return null;
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      country: user.country,
      countryFlag: user.countryFlag,
      currency: user.currency,
      registrationStatus: user.registrationStatus,
      activePlan: user.activePlan,
      planStatus: user.planStatus,
      pendingPlan: user.pendingPlan,
      avatarInitial: user.avatarInitial,
      isAdmin: isLocalAdminEmail(user.email),
      createdAt: user.createdAt,
    } as SessionUser;
  } catch {
    return null;
  }
}

/**
 * Resolve the current user. Uses Supabase when configured,
 * otherwise falls back to the local Postgres session cookie.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  if (isSupabaseConfigured()) return getSupabaseCurrentUser();
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(COOKIE_NAME)?.value;
  if (!sessionId) return null;
  const id = parseInt(sessionId, 10);
  if (!id) return null;
  return getUserById(id);
}

/**
 * Resolve a user from a ?t= token (works when the browser blocks cookies).
 * Supabase mode: the token is a Supabase access JWT.
 * Local mode: the token is a short-lived signed user id.
 */
export async function getUserByToken(t: string | null | undefined): Promise<SessionUser | null> {
  if (!t) return null;
  if (isSupabaseConfigured()) {
    try {
      const tc = createTokenSupabase(t);
      const { data, error } = await tc.auth.getUser(t);
      if (error || !data.user) return null;
      return await fetchSupabaseProfile(tc, data.user.id, data.user.email || "");
    } catch {
      return null;
    }
  }
  const id = verifyUserToken(t);
  if (!id) return null;
  return getUserById(id);
}

/**
 * Build a ?t= token for deep links for the given user.
 * Supabase mode: the user's access JWT. Local mode: a short-lived signed id.
 */
export async function getUserSessionToken(user: SessionUser): Promise<string> {
  if (isSupabaseConfigured()) return getSupabaseAccessToken();
  const numId = Number(user.id);
  return Number.isFinite(numId) && numId > 0 ? signUserToken(numId) : "";
}
