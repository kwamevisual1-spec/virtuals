"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Zap, LogOut, Loader2 } from "lucide-react";

export type HeaderUser = {
  id: string | number;
  fullName: string;
  email: string;
  registrationStatus: string;
  activePlan: string;
  planStatus: string;
  pendingPlan: string | null;
  avatarInitial: string | null;
  isAdmin: boolean;
  isAgent?: boolean;
};

/**
 * Site header.
 * - Signed OUT: logo + "Sign in" / "Create account".
 * - Signed IN: logo + avatar/name + "Sign out" (never "Sign in"/"Create account").
 * Recognises token sessions too (works when the browser blocks cookies in
 * embedded previews) by checking sessionStorage and asking /api/me.
 */
export function SiteHeader({ initialUser }: { initialUser: HeaderUser | null }) {
  const pathname = usePathname();
  const [user, setUser] = useState<HeaderUser | null>(initialUser);
  const [token, setToken] = useState("");
  // Until we know for sure, never show "Sign in"/"Create account" — a
  // signed-in user must never see those (skeleton instead).
  const [resolved, setResolved] = useState<boolean>(initialUser !== null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (initialUser) return;
    let alive = true;
    (async () => {
      try {
        // 1) session saved at sign-in (works when cookies are blocked)
        let stored: { access_token?: string } | null = null;
        try {
          const raw =
            sessionStorage.getItem("vp_session") ||
            sessionStorage.getItem("vp_admin_session");
          stored = raw ? JSON.parse(raw) : null;
        } catch {
          stored = null;
        }
        // 2) fallback: the ?t= token already in the page URL
        const urlToken = new URLSearchParams(window.location.search).get("t") || "";
        const access = stored?.access_token || urlToken;

        if (!access) {
          setResolved(true); // genuinely signed out
          return;
        }
        setToken(access);
        const res = await fetch(`/api/me?t=${encodeURIComponent(access)}`);
        const d = res.ok ? await res.json() : null;
        if (!alive) return;
        if (d?.user) setUser(d.user as HeaderUser);
        setResolved(true);
      } catch {
        if (alive) setResolved(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [initialUser]);

  async function signOut() {
    setLoggingOut(true);
    try {
      sessionStorage.removeItem("vp_session");
      sessionStorage.removeItem("vp_admin_session");
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // still continue
    }
    window.location.replace("/");
  }

  const initial =
    user?.avatarInitial ||
    (user?.fullName
      ? user.fullName
          .split(" ")
          .map((p) => p[0])
          .slice(0, 1)
          .join("")
          .toUpperCase()
      : null);

  const t = token ? `?t=${encodeURIComponent(token)}` : "";
  const homeHref = user ? user.isAdmin ? `/admin${t}` : user.isAgent ? `/agent${t}` : `/dashboard${t}` : "/";
  const planLabel = user
    ? user.isAdmin
      ? "Admin"
      : user.isAgent
        ? "Agent"
        : user.activePlan !== "none"
        ? `${user.activePlan} plan`
        : user.planStatus === "pending"
          ? "plan pending"
          : "member"
    : "";

  return (
    <header className="sticky top-0 z-30 border-b border-red-100 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <Link href={homeHref} className="flex items-center gap-2.5 sm:gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-red-700 shadow-lg shadow-red-500/30">
            <Zap className="h-5 w-5 fill-white text-white" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-extrabold tracking-tight sm:text-lg">
              INSTANT<span className="text-cyan-300">VIRTUALS</span>
            </div>
            <div className="hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 sm:block">
              AI Football Intelligence
            </div>
          </div>
        </Link>

        {!resolved ? (
          /* Resolving session: neutral skeleton, never sign-in buttons. */
          <div className="flex items-center gap-2" aria-hidden="true">
            <div className="hidden h-9 w-24 animate-pulse rounded-full bg-slate-100 sm:block" />
            <div className="h-10 w-10 animate-pulse rounded-full bg-slate-100" />
          </div>
        ) : user ? (
          /* Signed in: only account controls — never "Sign in"/"Create account". */
          <div className="flex items-center gap-2 sm:gap-3">
            {!user.isAdmin && user.registrationStatus === "approved" && (
              <Link
                href={`/plans${t}`}
                className="hidden rounded-full border border-red-200 bg-white px-4 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-50 sm:inline-flex"
              >
                View Plans
              </Link>
            )}
            <Link
              href={user.isAgent ? `/agent${t}` : user.isAdmin ? `/admin${t}` : `/profile${t}`}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 transition hover:border-red-200 hover:bg-red-50 sm:pr-3"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-700 text-sm font-bold text-white shadow-sm">
                {initial || <UserIconFallback />}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block max-w-[120px] truncate text-sm font-semibold leading-tight text-slate-800">
                  {user.fullName.split(" ")[0]}
                </span>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {planLabel}
                </span>
              </span>
            </Link>
            <button
              onClick={signOut}
              disabled={loggingOut}
              title="Sign out"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 shadow-sm transition hover:bg-red-50 disabled:opacity-60"
            >
              {loggingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
            </button>
          </div>
        ) : pathname === "/" || pathname === "/signin" || pathname === "/signup" || pathname === "/reset-password" ? (
          /* These pages already contain their own auth actions. */
          <div className="h-9 w-2" aria-hidden="true" />
        ) : (
          /* Signed out only. */
          <div className="flex items-center gap-2">
            <Link
              href="/signin"
              className="rounded-full px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 sm:px-4"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-red-600 px-3.5 py-2 text-sm font-semibold text-white shadow-md shadow-red-500/30 transition hover:bg-red-700 sm:px-4"
            >
              Create account
            </Link>
          </div>
        )}
      </div>

      {/* Admin-only view switcher: one site, three experiences. */}
      {user?.isAdmin && (
        <div className="border-t border-red-100 bg-red-50/60">
          <div className="mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto px-4 py-1.5">
            <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-red-700">
              View as
            </span>
            {[
              { label: "Admin", href: `/admin${t}` },
              { label: "Customer", href: `/dashboard?as=customer${t ? `&t=${encodeURIComponent(token)}` : ""}` },
              { label: "Agent", href: `/admin/agents${t}` },
            ].map((v) => (
              <Link
                key={v.label}
                href={v.href}
                className="flex-shrink-0 rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-bold text-red-700 transition hover:bg-red-600 hover:text-white"
              >
                {v.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

function UserIconFallback() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5Z" />
    </svg>
  );
}
