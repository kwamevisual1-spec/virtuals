import crypto from "crypto";

const SECRET = process.env.SESSION_SECRET || "virtuals-pro-dev-secret-change-me";

/** Create a signed token that identifies a user for the registration step. */
export function signUserToken(userId: number): string {
  const expires = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
  const payload = `${userId}.${expires}`;
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 32);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

/** Create a signed admin access token. */
export function signAdminToken(): string {
  const expires = Date.now() + 1000 * 60 * 60; // 1 hour
  const payload = `admin.${expires}`;
  const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex").slice(0, 32);
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

/** Verify an admin token. */
export function verifyAdminToken(token: string | null | undefined): boolean {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [role, expires, sig] = decoded.split(".");
    if (role !== "admin" || !expires || !sig) return false;
    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(`${role}.${expires}`)
      .digest("hex")
      .slice(0, 32);
    if (expected.length !== sig.length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
    return Number(expires) > Date.now();
  } catch {
    return false;
  }
}

/** Verify a token and return the userId, or null. */
export function verifyUserToken(token: string | null | undefined): number | null {
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [id, expires, sig] = decoded.split(".");
    if (!id || !expires || !sig) return null;
    const expected = crypto
      .createHmac("sha256", SECRET)
      .update(`${id}.${expires}`)
      .digest("hex")
      .slice(0, 32);
    if (expected.length !== sig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
    if (Number(expires) < Date.now()) return null;
    const n = parseInt(id, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
