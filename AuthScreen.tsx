"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  User,
  Mail,
  Phone,
  Globe2,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Check,
  AlertCircle,
  Zap,
} from "lucide-react";

const COUNTRIES = [
  { code: "GH", name: "Ghana", flag: "🇬🇭", currency: "GHS", dial: "+233" },
  { code: "NG", name: "Nigeria", flag: "🇳🇬", currency: "NGN", dial: "+234" },
  { code: "KE", name: "Kenya", flag: "🇰🇪", currency: "KES", dial: "+254" },
  { code: "ZA", name: "South Africa", flag: "🇿🇦", currency: "ZAR", dial: "+27" },
  { code: "UG", name: "Uganda", flag: "🇺🇬", currency: "UGX", dial: "+256" },
  { code: "TZ", name: "Tanzania", flag: "🇹🇿", currency: "TZS", dial: "+255" },
  { code: "CM", name: "Cameroon", flag: "🇨🇲", currency: "XAF", dial: "+237" },
  { code: "CI", name: "Côte d'Ivoire", flag: "🇨🇮", currency: "XOF", dial: "+225" },
  { code: "GB", name: "United Kingdom", flag: "🇬🇧", currency: "GBP", dial: "+44" },
  { code: "US", name: "United States", flag: "🇺🇸", currency: "USD", dial: "+1" },
];

type Tab = "signup" | "signin" | "forgot";

export function AuthScreen({ defaultTab = "signup" }: { defaultTab?: Tab }) {
  const searchParams = useSearchParams();
  const msgParam = searchParams.get("msg");
  const errorParam = searchParams.get("error");

  const [tab, setTab] = useState<Tab>(defaultTab);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(errorParam);
  const [success, setSuccess] = useState<string | null>(msgParam);
  const [countryIdx, setCountryIdx] = useState(0);
  const country = COUNTRIES[countryIdx];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    if (tab === "forgot") {
      const email = String(fd.get("email") || "").trim().toLowerCase();
      try {
        const res = await fetch("/api/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) setError(data.error || "Could not send the reset link. Please try again.");
        else setSuccess(data.message || "If an account exists for that email, a password reset link is on its way. Check your inbox and spam folder.");
      } catch {
        setError("Network error. Please try again.");
      }
      setLoading(false);
      return;
    }

    if (tab === "signup") {
      const payload = {
        fullName: String(fd.get("fullName") || "").trim(),
        email: String(fd.get("email") || "").trim().toLowerCase(),
        phone: String(fd.get("phone") || "").trim(),
        country: country.name,
        countryFlag: country.flag,
        currency: country.currency,
        password: String(fd.get("password") || ""),
        confirmPassword: String(fd.get("confirmPassword") || ""),
      };
      if (payload.password.length < 6) {
        setError("Password must be at least 6 characters.");
        setLoading(false);
        return;
      }
      if (payload.password !== payload.confirmPassword) {
        setError("Passwords do not match.");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Something went wrong. Please try again.");
          setLoading(false);
          return;
        }
        try {
          if (data.session?.access_token) {
            sessionStorage.setItem("vp_session", JSON.stringify(data.session));
            sessionStorage.setItem("vp_admin_session", JSON.stringify(data.session));
          }
        } catch {
          // storage unavailable; the returned link token still works
        }
        window.location.href = data.nextPath || "/onboarding";
        return;
      } catch {
        setError("Network error. Please try again.");
        setLoading(false);
        return;
      }
    }

    const payload = {
      email: String(fd.get("email") || "").trim().toLowerCase(),
      password: String(fd.get("password") || ""),
    };
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Invalid credentials.");
        setLoading(false);
        return;
      }
      try {
        if (data.session?.access_token) {
          sessionStorage.setItem("vp_session", JSON.stringify(data.session));
          sessionStorage.setItem("vp_admin_session", JSON.stringify(data.session));
        } else {
          sessionStorage.removeItem("vp_session");
          sessionStorage.removeItem("vp_admin_session");
        }
      } catch {
        // storage unavailable; the link token still works
      }
      window.location.href = data.nextPath || "/dashboard";
      return;
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="auth-red-bg min-h-[calc(100vh-80px)] py-8 sm:py-12">
      <div className="mx-auto max-w-xl px-4">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-white shadow-xl shadow-red-900/30">
            <Zap className="h-8 w-8 fill-red-600 text-red-600" strokeWidth={2.5} />
          </div>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.3em] text-red-100">
            Smart Virtual Predictions
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
            {tab === "signup" ? "Create your account" : tab === "forgot" ? "Reset your password" : "Welcome back"}
          </h1>
          <p className="mt-3 text-red-100">
            {tab === "signup"
              ? "Join Virtuals Pro and start winning today."
              : tab === "forgot"
                ? "Enter your email and we'll send you a link to set a new password."
                : "Sign in to access your smart predictions."}
          </p>
        </div>

        {success && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-600" />
            <div>{success}</div>
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
            <div>{error}</div>
          </div>
        )}

        <div className="glass-card rounded-3xl p-6 sm:p-8">
          <form onSubmit={onSubmit} className="space-y-5" key={tab}>
            {tab === "signup" && (
              <>
                <Field label="Full name">
                  <User className="h-5 w-5 text-red-500" />
                  <input name="fullName" placeholder="Your name" required />
                </Field>

                <Field label="Email">
                  <Mail className="h-5 w-5 text-red-500" />
                  <input name="email" type="email" placeholder="you@example.com" required />
                </Field>

                <Field label="Phone Number">
                  <Phone className="h-5 w-5 text-red-500" />
                  <input name="phone" type="tel" placeholder={`0541234567 or ${country.dial}...`} required />
                </Field>

                <div>
                  <label className="mb-2 block text-base font-semibold text-slate-800">Country</label>
                  <div className="input-shell h-14">
                    <Globe2 className="h-5 w-5 text-red-500" />
                    <select
                      value={countryIdx}
                      onChange={(e) => setCountryIdx(Number(e.target.value))}
                      className="h-full w-full bg-transparent text-base outline-none"
                    >
                      {COUNTRIES.map((c, idx) => (
                        <option key={c.code} value={idx}>
                          {c.flag} {c.name} ({c.currency})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <Field label="Password">
                  <Lock className="h-5 w-5 text-red-500" />
                  <input name="password" type={showPw ? "text" : "password"} placeholder="At least 6 characters" required minLength={6} />
                  <button type="button" onClick={() => setShowPw((v) => !v)} className="text-slate-400 transition hover:text-slate-700" aria-label="Toggle password visibility">
                    {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </Field>

                <Field label="Confirm password">
                  <Lock className="h-5 w-5 text-red-500" />
                  <input name="confirmPassword" type={showConfirm ? "text" : "password"} placeholder="Repeat password" required minLength={6} />
                  <button type="button" onClick={() => setShowConfirm((v) => !v)} className="text-slate-400 transition hover:text-slate-700" aria-label="Toggle confirm password visibility">
                    {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </Field>
              </>
            )}

            {tab === "signin" && (
              <>
                <Field label="Email">
                  <Mail className="h-5 w-5 text-red-500" />
                  <input name="email" type="email" placeholder="you@example.com" required />
                </Field>

                <Field label="Password">
                  <Lock className="h-5 w-5 text-red-500" />
                  <input name="password" type={showPw ? "text" : "password"} placeholder="Your password" required />
                  <button type="button" onClick={() => setShowPw((v) => !v)} className="text-slate-400 transition hover:text-slate-700" aria-label="Toggle password visibility">
                    {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </Field>

                <div className="-mt-2 text-right">
                  <button type="button" onClick={() => { setTab("forgot"); setError(null); setSuccess(null); }} className="text-sm font-semibold text-red-600 hover:text-red-700">
                    Forgot password?
                  </button>
                </div>
              </>
            )}

            {tab === "forgot" && (
              <Field label="Email">
                <Mail className="h-5 w-5 text-red-500" />
                <input name="email" type="email" placeholder="you@example.com" required autoFocus />
              </Field>
            )}

            <button type="submit" disabled={loading} className="btn-primary mt-2">
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {tab === "signup" ? "Creating account..." : tab === "forgot" ? "Sending link..." : "Signing in..."}
                </>
              ) : tab === "forgot" ? (
                <>
                  <Mail className="h-5 w-5" />
                  Send reset link
                </>
              ) : tab === "signup" ? (
                <>
                  <Check className="h-5 w-5" />
                  Create account
                </>
              ) : (
                <>
                  <Lock className="h-5 w-5" />
                  Sign in
                </>
              )}
            </button>
          </form>
        </div>

        <div className="mt-8 text-center text-slate-600">
          {tab === "forgot" ? (
            <>
              Remembered your password?{" "}
              <button type="button" onClick={() => { setTab("signin"); setError(null); setSuccess(null); }} className="font-semibold text-red-600 hover:text-red-700">
                Back to sign in
              </button>
            </>
          ) : tab === "signup" ? (
            <>
              Already have an account?{" "}
              <button type="button" onClick={() => { setTab("signin"); setError(null); setSuccess(null); }} className="font-semibold text-red-600 hover:text-red-700">
                Sign in
              </button>
            </>
          ) : (
            <>
              Don&apos;t have an account?{" "}
              <button type="button" onClick={() => { setTab("signup"); setError(null); setSuccess(null); }} className="font-semibold text-red-600 hover:text-red-700">
                Create one
              </button>
            </>
          )}
        </div>

        <div className="mt-6 text-center text-xs text-slate-400">
          By continuing you agree to our Terms &amp; Privacy Policy.
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-base font-semibold text-slate-800">{label}</label>
      <div className="input-shell">{children}</div>
    </div>
  );
}
