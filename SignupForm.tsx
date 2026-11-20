"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export function SignupForm() {
  const router = useRouter();
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countryIdx, setCountryIdx] = useState(0);
  const [phone, setPhone] = useState("");

  const country = COUNTRIES[countryIdx];

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
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
    if (!payload.phone) {
      setError("Please enter a valid phone number.");
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
      router.push("/onboarding");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Field label="Full name">
        <User className="h-5 w-5 text-red-500" />
        <input name="fullName" placeholder="Your name" required />
      </Field>

      <Field label="Email">
        <Mail className="h-5 w-5 text-red-500" />
        <input
          name="email"
          type="email"
          placeholder="you@example.com"
          required
        />
      </Field>

      <Field label="Phone Number">
        <Phone className="h-5 w-5 text-red-500" />
        <input
          name="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={`0541234567 or ${country.dial}...`}
          required
        />
      </Field>

      <div>
        <label className="mb-2 block text-base font-semibold text-slate-800">
          Country
        </label>
        <div className="input-shell h-14 cursor-pointer">
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
        <input
          name="password"
          type={showPw ? "text" : "password"}
          placeholder="At least 6 characters"
          required
          minLength={6}
        />
        <button
          type="button"
          onClick={() => setShowPw((v) => !v)}
          className="text-slate-400 transition hover:text-slate-700"
          aria-label="Toggle password visibility"
        >
          {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      </Field>

      <Field label="Confirm password">
        <Lock className="h-5 w-5 text-red-500" />
        <input
          name="confirmPassword"
          type={showConfirm ? "text" : "password"}
          placeholder="Repeat password"
          required
          minLength={6}
        />
        <button
          type="button"
          onClick={() => setShowConfirm((v) => !v)}
          className="text-slate-400 transition hover:text-slate-700"
          aria-label="Toggle confirm password visibility"
        >
          {showConfirm ? (
            <EyeOff className="h-5 w-5" />
          ) : (
            <Eye className="h-5 w-5" />
          )}
        </button>
      </Field>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn-primary mt-2"
      >
        {loading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Creating account...
          </>
        ) : (
          <>
            <Check className="h-5 w-5" />
            Create account
          </>
        )}
      </button>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-2 block text-base font-semibold text-slate-800">
        {label}
      </label>
      <div className="input-shell">{children}</div>
    </div>
  );
}
