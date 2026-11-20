"use client";

import { useEffect, useState } from "react";
import {
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Check,
  AlertCircle,
  KeyRound,
} from "lucide-react";

type Phase = "checking" | "ready" | "invalid" | "done";

export function ResetPasswordForm() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [accessToken, setAccessToken] = useState("");
  const [invalidReason, setInvalidReason] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read the recovery token that Supabase puts in the link's #fragment.
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const query = new URLSearchParams(window.location.search);
    const token = params.get("access_token");
    const type = params.get("type");
    const errDesc = params.get("error_description") || query.get("error_description");
    const errCode = params.get("error_code") || query.get("error_code");

    // Remove the token from the address bar so it isn't left in history.
    if (hash || window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }

    if (token && type === "recovery") {
      setAccessToken(token);
      setPhase("ready");
    } else {
      setInvalidReason(
        errCode === "otp_expired" || /expired/i.test(errDesc || "")
          ? "This reset link has expired. Reset links can only be used once and expire quickly."
          : errDesc
            ? errDesc.replace(/\+/g, " ")
            : "This reset link is invalid or has already been used."
      );
      setPhase("invalid");
    }
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") || "");
    const confirm = String(fd.get("confirm") || "");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not update your password.");
        setLoading(false);
        return;
      }
      setPhase("done");
      setTimeout(() => {
        window.location.replace(
          "/signin?msg=" +
            encodeURIComponent(
              "Your password has been updated. Sign in with your new password."
            )
        );
      }, 1800);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4">
      <div className="mb-8 text-center">
        <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-red-500 to-red-700 shadow-xl shadow-red-500/30">
          <KeyRound className="h-8 w-8 text-white" strokeWidth={2.25} />
        </div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.3em] text-red-600">
          Account security
        </div>
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
          Set a new password
        </h1>
        <p className="mt-3 text-slate-600">
          Choose a strong password you haven&apos;t used before.
        </p>
      </div>

      <div className="glass-card rounded-3xl p-6 sm:p-8">
        {phase === "checking" && (
          <div className="flex items-center justify-center gap-2 py-8 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Verifying your reset link...
          </div>
        )}

        {phase === "invalid" && (
          <div className="space-y-5 text-center">
            <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertCircle className="h-7 w-7" />
            </div>
            <p className="text-slate-700">{invalidReason}</p>
            <a href="/signin" className="btn-primary">
              Request a new link
            </a>
            <p className="text-xs text-slate-400">
              On the sign-in page tap &ldquo;Forgot password?&rdquo; to get a fresh link.
            </p>
          </div>
        )}

        {phase === "ready" && (
          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="mb-2 block text-base font-semibold text-slate-800">
                New password
              </label>
              <div className="input-shell">
                <Lock className="h-5 w-5 text-red-500" />
                <input
                  name="password"
                  type={showPw ? "text" : "password"}
                  placeholder="At least 6 characters"
                  minLength={6}
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="text-slate-400 transition hover:text-slate-700"
                  aria-label="Toggle password visibility"
                >
                  {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-base font-semibold text-slate-800">
                Confirm new password
              </label>
              <div className="input-shell">
                <Lock className="h-5 w-5 text-red-500" />
                <input
                  name="confirm"
                  type={showConfirm ? "text" : "password"}
                  placeholder="Repeat new password"
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="text-slate-400 transition hover:text-slate-700"
                  aria-label="Toggle confirm password visibility"
                >
                  {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <div>{error}</div>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary mt-2">
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Check className="h-5 w-5" />
                  Update password
                </>
              )}
            </button>
          </form>
        )}

        {phase === "done" && (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-500 text-white shadow-lg shadow-green-500/30">
              <Check className="h-8 w-8" strokeWidth={3} />
            </div>
            <h2 className="text-2xl font-black">Password updated</h2>
            <p className="text-slate-600">Taking you to sign in...</p>
          </div>
        )}
      </div>
    </div>
  );
}
