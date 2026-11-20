import { hasReferralSigningSecret, isReferralCode } from "./referrals";

const PRIVATE_HOSTS = ["arena.ai", "arena.site", "lmarena.ai", "e2b.app", "e2b.dev", "supabase.co", "localhost", "local", "internal", "invalid", "test"];

type RequestHeaders = Pick<Headers, "get">;
export type PublicLinkStatus = "ready" | "unpublished" | "referrals-not-configured";

function httpsPublicOrigin(value: string): string | null {
  if (!/^https:\/\//i.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host) || /^[\d.]+$/.test(host)) return null;
    if (PRIVATE_HOSTS.some((name) => host === name || host.endsWith(`.${name}`))) return null;
    url.hostname = host;
    return url.origin;
  } catch {
    return null;
  }
}

/** Distributable URLs are not the same thing as the internal request origin. */
export function publicSiteOrigin(headers: RequestHeaders, requestUrl?: string): string | null {
  const configured = process.env.SITE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  // An explicitly configured but invalid address does not silently fall back.
  if (configured) return httpsPublicOrigin(configured);
  if (process.env.VERCEL_ENV === "preview") return null;

  const origin = requestUrl ? new URL(requestUrl) : null;
  const host = (headers.get("x-forwarded-host") || headers.get("host") || origin?.host || "").split(",")[0].trim();
  const proto = (headers.get("x-forwarded-proto") || origin?.protocol.slice(0, -1) || "").split(",")[0].trim();
  if (proto !== "https" || !/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)) return null;
  return httpsPublicOrigin(`https://${host}`);
}

export function hasPublicReferralHost(origin: string | null): boolean {
  return Boolean(origin);
}

export function publicLinkStatus(origin: string | null): PublicLinkStatus {
  if (!origin) return "unpublished";
  return hasReferralSigningSecret() ? "ready" : "referrals-not-configured";
}

export function agentContactLinks(origin: string | null, code: string) {
  return {
    loginLink: origin && isReferralCode(code) ? new URL(`/signin?agent=${encodeURIComponent(code)}`, origin).href : null,
    referralLink: origin && hasReferralSigningSecret() && isReferralCode(code)
      ? new URL(`/r/${encodeURIComponent(code)}`, origin).href
      : null,
  };
}
