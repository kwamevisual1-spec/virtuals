"use client";

import { useEffect } from "react";

/**
 * Safety net: if a password-reset link lands on any other page (for example
 * the Supabase "Site URL"), forward it to /reset-password with its token.
 */
export function RecoveryRedirect() {
  useEffect(() => {
    const { pathname, hash } = window.location;
    if (pathname === "/reset-password") return;
    if (hash && /(^|[#&])type=recovery(&|$)/.test(hash)) {
      window.location.replace("/reset-password" + hash);
    } else if (hash && /error_code=otp_expired/.test(hash) && /type=recovery|sb=|error_description/.test(hash)) {
      window.location.replace("/reset-password" + hash);
    }
  }, []);
  return null;
}
