"use client";

import Link from "next/link";
import {
  Gem,
  History,
  LogOut,
  Mail,
  Phone,
  Globe,
  Calendar,
  ShieldCheck,
  Loader2,
  BarChart3,
  ChevronRight,
} from "lucide-react";
import { BottomNav, type NavKey } from "./BottomNav";

export type ProfileData = {
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
  planName: string | null;
  dailyLimit: number | null;
  usedToday: number;
  memberSince: string | null;
};

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ProfileView({ data, token }: { data: ProfileData; token: string }) {
  const initial =
    data.fullName
      .split(" ")
      .map((p) => p[0])
      .slice(0, 1)
      .join("")
      .toUpperCase() || "U";

  const planPill =
    data.planStatus === "active" && data.planName ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white ring-1 ring-white/30">
        <Gem className="h-3.5 w-3.5" />
        {data.planName} Plan
      </span>
    ) : data.planStatus === "pending" ? (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/25 px-3 py-1 text-xs font-bold text-amber-100 ring-1 ring-amber-300/40">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {data.pendingPlan || "Plan"} pending
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold text-white/90 ring-1 ring-white/25">
        <Gem className="h-3.5 w-3.5" />
        No active plan
      </span>
    );

  const rows = [
    { icon: <UserRowIcon />, label: "Full name", value: data.fullName },
    { icon: <Mail className="h-4 w-4" />, label: "Email", value: data.email },
    { icon: <Phone className="h-4 w-4" />, label: "Phone", value: data.phone || "—" },
    {
      icon: <Globe className="h-4 w-4" />,
      label: "Country",
      value: `${data.countryFlag} ${data.country}`,
    },
    {
      icon: <Calendar className="h-4 w-4" />,
      label: "Member since",
      value: fmtDate(data.memberSince),
    },
    {
      icon: <ShieldCheck className="h-4 w-4" />,
      label: "Account",
      value:
        data.registrationStatus === "approved" ? "Approved" : "Awaiting approval",
      highlight: data.registrationStatus === "approved",
    },
  ];

  return (
    <main className="relative bg-gradient-to-b from-white via-white to-red-50/40 pb-28">
      <div className="mx-auto max-w-2xl px-4 py-6">
        {/* Profile hero */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-red-600 to-red-800 p-6 text-white shadow-xl sm:p-8">
          <div
            className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full opacity-30"
            style={{ background: "radial-gradient(circle, #fff 0%, transparent 70%)" }}
          />
          <div className="relative flex items-center gap-4">
            <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full bg-white text-3xl font-black text-red-700 shadow-lg ring-4 ring-white/30">
              {initial}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">
                {data.fullName}
              </h1>
              <p className="truncate text-sm text-red-100">{data.email}</p>
              <div className="mt-2 flex flex-wrap gap-2">{planPill}</div>
            </div>
          </div>

          {/* Stats */}
          <div className="relative mt-6 grid grid-cols-3 divide-x divide-white/15 rounded-2xl bg-white/10 ring-1 ring-white/20">
            <div className="px-3 py-3 text-center">
              <div className="text-[10px] font-bold uppercase tracking-widest text-red-200">
                Plan
              </div>
              <div className="mt-1 truncate text-base font-extrabold sm:text-lg">
                {data.planName || "None"}
              </div>
            </div>
            <div className="px-3 py-3 text-center">
              <div className="text-[10px] font-bold uppercase tracking-widest text-red-200">
                Today
              </div>
              <div className="mt-1 text-base font-extrabold sm:text-lg">
                {data.dailyLimit !== null
                  ? `${data.usedToday}/${data.dailyLimit}`
                  : `${data.usedToday}`}
              </div>
            </div>
            <div className="px-3 py-3 text-center">
              <div className="text-[10px] font-bold uppercase tracking-widest text-red-200">
                Currency
              </div>
              <div className="mt-1 text-base font-extrabold sm:text-lg">
                {data.currency}
              </div>
            </div>
          </div>
        </section>

        {/* Quick actions */}
        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href={`/plans?t=${encodeURIComponent(token)}`}
            className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-red-200 hover:shadow-md"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <Gem className="h-5 w-5" />
              </span>
              <span className="text-left">
                <span className="block text-sm font-bold text-slate-900">
                  View Plans
                </span>
                <span className="block text-xs text-slate-500">
                  Upgrade or change your plan
                </span>
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-red-600" />
          </Link>

          <Link
            href={`/history?t=${encodeURIComponent(token)}`}
            className="group flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-red-200 hover:shadow-md"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <History className="h-5 w-5" />
              </span>
              <span className="text-left">
                <span className="block text-sm font-bold text-slate-900">
                  Prediction History
                </span>
                <span className="block text-xs text-slate-500">
                  Your past smart picks
                </span>
              </span>
            </span>
            <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-red-600" />
          </Link>
        </section>

        {/* Account details */}
        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
            <ShieldCheck className="h-5 w-5 text-red-600" />
            <h2 className="text-base font-extrabold tracking-tight text-slate-900">
              Account details
            </h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => (
              <li
                key={r.label}
                className="flex items-center justify-between gap-3 px-5 py-3.5"
              >
                <span className="flex items-center gap-3 text-sm text-slate-500">
                  <span className="text-slate-400">{r.icon}</span>
                  {r.label}
                </span>
                <span
                  className={
                    "max-w-[60%] truncate text-sm font-semibold " +
                    (r.highlight ? "text-emerald-600" : "text-slate-900")
                  }
                >
                  {r.value}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Daily usage */}
        {data.dailyLimit !== null && (
          <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-red-600" />
                <h2 className="text-base font-extrabold tracking-tight text-slate-900">
                  Today&apos;s predictions
                </h2>
              </div>
              <span className="text-sm font-bold text-slate-600">
                {data.usedToday} / {data.dailyLimit}
              </span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-600 transition-all"
                style={{
                  width: `${Math.min(100, (data.usedToday / Math.max(1, data.dailyLimit)) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Your {data.planName || "plan"} allows {data.dailyLimit} prediction
              {data.dailyLimit === 1 ? "" : "s"} per day.
            </p>
          </section>
        )}

        {/* Sign out */}
        <SignOutButton />
      </div>

      <BottomNav token={token} active="profile" />
    </main>
  );
}

function UserRowIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5Z" />
    </svg>
  );
}

function SignOutButton() {
  async function signOut() {
    try {
      sessionStorage.removeItem("vp_session");
      sessionStorage.removeItem("vp_admin_session");
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // continue anyway
    }
    window.location.replace("/");
  }
  return (
    <button
      onClick={signOut}
      className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-red-200 bg-white py-3.5 text-sm font-bold text-red-600 transition hover:border-red-600 hover:bg-red-50"
    >
      <LogOut className="h-4 w-4" />
      Sign out
    </button>
  );
}
