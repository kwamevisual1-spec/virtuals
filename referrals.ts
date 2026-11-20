import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const REFERRAL_COOKIE = "vp_first_referral";

export const REFERRAL_MAX_AGE = 30 * 24 * 60 * 60;

function secret() {
  return process.env.REFERRAL_SECRET?.trim() || process.env.SESSION_SECRET?.trim() || "";
}

export function hasReferralSigningSecret(): boolean {
  return Boolean(secret());
}

export function isReferralCode(code: string): boolean {
  return /^[A-Za-z0-9_-]{5,32}$/.test(code);
}

export function signReferral(code: string): string {
  const key = secret();
  if (!key) throw new Error("REFERRAL_SECRET or SESSION_SECRET must be configured");
  if (!isReferralCode(code)) throw new Error("Invalid referral code");
  const payload = `${code}.${Date.now()}`;
  const signature = createHmac("sha256", key).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function verifyReferral(value: string | undefined | null): string | null {
  const key = secret();
  if (!value || !key) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [code, created, signature] = parts;
  if (!isReferralCode(code) || !/^\d{1,16}$/.test(created) || !/^[0-9a-f]{64}$/.test(signature)) return null;
  const age = Date.now() - Number(created);
  if (age < 0 || age > REFERRAL_MAX_AGE * 1000) return null;
  const expected = createHmac("sha256", key).update(`${code}.${created}`).digest();
  return timingSafeEqual(Buffer.from(signature, "hex"), expected) ? code : null;
}

export async function firstReferral() {
  return verifyReferral((await cookies()).get(REFERRAL_COOKIE)?.value);
}
