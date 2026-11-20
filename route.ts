import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { REFERRAL_COOKIE, REFERRAL_MAX_AGE, hasReferralSigningSecret, isReferralCode, signReferral, verifyReferral } from "@/lib/referrals";
import { isSupabaseConfigured, getSupabaseUrl, getSupabaseAnonKey } from "@/lib/supabase";

export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  // The cookie is host-only. Stay on the host that received the click, including public aliases.
  const response = new NextResponse(null, { status: 307, headers: { Location: "/", "Cache-Control": "private, no-store" } });
  if (!isSupabaseConfigured() || !hasReferralSigningSecret() || !isReferralCode(code)) return response;
  if (verifyReferral(request.cookies.get(REFERRAL_COOKIE)?.value)) return response;

  try {
    const client = createClient(getSupabaseUrl(), getSupabaseAnonKey(), { auth: { persistSession: false } });
    const { data, error } = await client.rpc("valid_referral", { p_code: code });
    if (!error && data === true) {
      const secure = request.nextUrl.protocol === "https:" || request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
      response.cookies.set(REFERRAL_COOKIE, signReferral(code), {
        httpOnly: true, sameSite: secure ? "none" : "lax", secure,
        path: "/", maxAge: REFERRAL_MAX_AGE,
      });
      await client.rpc("track_referral_click", { p_code: code });
    }
  } catch (error) {
    console.error("Referral validation failed", error);
  }
  return response;
}
