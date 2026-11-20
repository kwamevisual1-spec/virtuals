import crypto from "crypto";

/**
 * A pending sign-up is NOT stored anywhere (not in Supabase, not in a DB).
 * The details live inside this encrypted ticket that travels with the
 * registration-fee page. Only when the customer submits their payment proof
 * do we decrypt it and create the real account.
 */
export type PendingSignup = {
  fullName: string;
  email: string;
  phone: string;
  country: string;
  countryFlag: string;
  currency: string;
  password: string;
  referralCode?: string | null;
};

const SECRET =
  process.env.SESSION_SECRET || "virtuals-pro-signup-ticket-secret-v1";
const KEY = crypto.createHash("sha256").update(SECRET).digest();
const TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

export function encryptSignup(data: PendingSignup): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const payload = JSON.stringify({ d: data, e: Date.now() + TTL_MS });
  const enc = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptSignup(token: string | null | undefined): PendingSignup | null {
  if (!token) return null;
  try {
    const buf = Buffer.from(token, "base64url");
    if (buf.length < 29) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(out) as { d: PendingSignup; e: number };
    if (!parsed?.d || Number(parsed.e) < Date.now()) return null;
    const d = parsed.d;
    if (!d.email || !d.password || !d.fullName) return null;
    return d;
  } catch {
    return null;
  }
}
