"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Lock,
  LogIn,
  LogOut,
  Check,
  X,
  Clock,
  ShieldCheck,
  User as UserIcon,
  Receipt,
  Gem,
  FileImage,
  Loader2,
  AlertCircle,
} from "lucide-react";

type PendingReg = {
  id: number;
  userId: string;
  amount: string;
  currency: string;
  network: string;
  transactionReference: string | null;
  screenshotName: string | null;
  screenshotData: string | null;
  screenshotUrl?: string | null;
  createdAt: Date | string | null;
  status: string;
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
  userCountry: string | null;
  userCountryFlag: string | null;
  userRegistrationStatus: string | null;
};

type PendingPlan = {
  id: number;
  userId: string;
  amount: string;
  currency: string;
  planCode: string | null;
  planName: string | null;
  network: string;
  transactionReference: string | null;
  screenshotName: string | null;
  screenshotData: string | null;
  screenshotUrl?: string | null;
  createdAt: Date | string | null;
  status: string;
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
  userActivePlan: string | null;
  userPendingPlan: string | null;
};

type RecentUser = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  country: string;
  registrationStatus: string;
  activePlan: string;
  planStatus: string;
  pendingPlan: string | null;
  createdAt: Date | string | null;
};

export function AdminPanel({
  pendingRegistrations,
  pendingPlans,
  recentUsers,
  preauthed = false,
  adminName,
  accessToken = "",
  supabaseUrl = "",
  supabaseAnonKey = "",
}: {
  pendingRegistrations: PendingReg[];
  pendingPlans: PendingPlan[];
  recentUsers: RecentUser[];
  preauthed?: boolean;
  adminName?: string;
  accessToken?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}) {
  const router = useRouter();
  const [authed, setAuthed] = useState(preauthed);
  const [adminToken, setAdminToken] = useState<string>("");
  const [pwd, setPwd] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [tab, setTab] = useState<"reg" | "plans" | "users">("reg");
  const [preview, setPreview] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pwd }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      setAdminToken(data.token || "");
      setAuthed(true);
    } else {
      setAuthError("Invalid admin password.");
    }
  }

  const SESSION_KEY = "vp_admin_session";
  type StoredSession = { access_token: string; refresh_token: string; expires_at: number };

  function readSession(): StoredSession | null {
    try {
      const raw =
        sessionStorage.getItem("vp_session") ||
        sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as StoredSession;
      return s?.access_token && s?.refresh_token ? s : null;
    } catch {
      return null;
    }
  }

  /**
   * Returns an access token that is valid right now. The browser keeps the
   * admin session and renews it (directly with Supabase) shortly before it
   * expires, so Approve never depends on a token frozen in the page address.
   */
  async function freshToken(force: boolean): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    let sess = readSession();
    if (sess && supabaseUrl && supabaseAnonKey && (force || sess.expires_at - now < 300)) {
      try {
        const r = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
          method: "POST",
          headers: { apikey: supabaseAnonKey, "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: sess.refresh_token }),
        });
        if (r.ok) {
          const d = await r.json();
          sess = {
            access_token: d.access_token,
            refresh_token: d.refresh_token,
            expires_at: d.expires_at || now + (d.expires_in || 3600),
          };
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(sess));
          // keep the server cookie on the same refresh token (harmless if blocked)
          fetch("/api/auth/set-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              access_token: sess.access_token,
              refresh_token: sess.refresh_token,
            }),
          }).catch(() => {});
        }
      } catch {
        // fall back to whatever token we have
      }
    }
    return sess?.access_token || accessToken;
  }

  async function signInAgain() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.replace("/signin");
  }

  async function act(
    paymentId: number,
    kind: "registration" | "plan",
    action: "approve" | "reject",
    planCode?: string | null
  ) {
    setLoadingId(paymentId);
    setActionError(null);
    setNeedsSignIn(false);
    try {
      const send = (token: string) =>
        fetch("/api/admin/review", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(adminToken ? { "x-admin-token": adminToken } : {}),
          },
          // the token also travels in the body, in case a header is dropped
          body: JSON.stringify({ paymentId, action, kind, planCode, accessToken: token }),
        });

      let token = await freshToken(false);
      let res = await send(token);

      // One automatic retry with a freshly renewed session.
      if (res.status === 401) {
        const first = await res.clone().json().catch(() => ({}));
        if (first.reason !== "not_admin") {
          token = await freshToken(true);
          res = await send(token);
        }
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const code = data.reason ? ` [${data.reason}]` : "";
        if (res.status === 401 && data.reason !== "not_admin") {
          setActionError(
            "Your admin session could not be verified" + code + ". Please sign in again, then retry."
          );
          setNeedsSignIn(true);
        } else {
          setActionError((data.error || "Action failed.") + code);
        }
        return;
      }

      if (supabaseUrl && token) {
        // Reload with a fresh token in the link so the page stays signed in.
        window.location.replace(`/admin?t=${encodeURIComponent(token)}`);
      } else {
        router.refresh();
      }
    } catch {
      setActionError("Network error. Please check your connection and try again.");
    } finally {
      setLoadingId(null);
    }
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-md">
        <div className="glass-card rounded-3xl p-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-white shadow-lg shadow-red-500/30">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-black">Admin Access</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter the admin password to review payments.
          </p>
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div className="input-shell">
              <Lock className="h-5 w-5 text-red-500" />
              <input
                type="password"
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                placeholder="Admin password"
                autoFocus
              />
            </div>
            {authError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {authError}
              </div>
            )}
            <button type="submit" className="btn-primary">
              <LogIn className="h-5 w-5" />
              Sign in to admin
            </button>
            <p className="text-xs text-slate-400">
              Default password is set by ADMIN_PASSWORD env (default:{" "}
              <code className="rounded bg-slate-100 px-1">admin123</code>).
            </p>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Admin Review Panel</h1>
          <p className="text-sm text-slate-500">
            {preauthed
              ? `Signed in as admin${adminName ? ` · ${adminName}` : ""}. Approve or reject payments below.`
              : "Approve or reject registration and plan payments."}
          </p>
        </div>
        {preauthed && (
          <>
            <Link href={`/admin/agents?t=${encodeURIComponent(accessToken)}`} className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700">Agent Management</Link>
            <Link href={`/dashboard?as=customer&t=${encodeURIComponent(accessToken)}`} className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-700 shadow-sm hover:bg-red-50">Customer view</Link>
          </>
        )}
        {preauthed && (
          <button
            onClick={async () => {
              try {
                sessionStorage.removeItem(SESSION_KEY);
              } catch {
                // ignore
              }
              await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
              window.location.replace("/");
            }}
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        )}
        <div className="flex gap-2 rounded-full bg-white p-1 shadow-sm">
          <TabBtn
            active={tab === "reg"}
            onClick={() => setTab("reg")}
            count={pendingRegistrations.length}
            label="Registrations"
          />
          <TabBtn
            active={tab === "plans"}
            onClick={() => setTab("plans")}
            count={pendingPlans.length}
            label="Plans"
          />
          <TabBtn
            active={tab === "users"}
            onClick={() => setTab("users")}
            label="Users"
          />
        </div>
      </div>

      {actionError && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{actionError}</span>
          {needsSignIn && (
            <button
              onClick={signInAgain}
              className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-bold text-white shadow hover:bg-red-700"
            >
              Sign in again
            </button>
          )}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setPreview(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-3xl overflow-auto rounded-2xl bg-white p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreview(null)}
              className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow"
            >
              <X className="h-4 w-4" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Payment proof" className="h-auto w-full" />
          </div>
        </div>
      )}

      {tab === "reg" && (
        <Section
          title="Pending Registration Payments"
          emptyText="No pending registrations."
          items={pendingRegistrations}
          render={(p) => (
            <PaymentCard
              key={p.id}
              title={p.userName || `User #${p.userId}`}
              subtitle={`${p.userEmail} · ${p.userPhone || "—"}`}
              badge={`${p.currency} ${p.amount}`}
              meta={
                <>
                  <MetaRow icon={<UserIcon className="h-4 w-4" />} label="Name">
                    {p.userName}
                  </MetaRow>
                  <MetaRow icon={<UserIcon className="h-4 w-4" />} label="Email">
                    {p.userEmail}
                  </MetaRow>
                  <MetaRow icon={<UserIcon className="h-4 w-4" />} label="Phone">
                    {p.userPhone}
                  </MetaRow>
                  <MetaRow icon={<UserIcon className="h-4 w-4" />} label="Country">
                    {p.userCountryFlag} {p.userCountry}
                  </MetaRow>
                  <MetaRow
                    icon={<Clock className="h-4 w-4" />}
                    label="Submitted"
                  >
                    {p.createdAt
                      ? new Date(p.createdAt).toLocaleString()
                      : "—"}
                  </MetaRow>
                  <MetaRow
                    icon={<Receipt className="h-4 w-4" />}
                    label="Reference"
                  >
                    {p.transactionReference || "—"}
                  </MetaRow>
                  {p.screenshotName && (
                    <MetaRow
                      icon={<FileImage className="h-4 w-4" />}
                      label="Screenshot"
                    >
                      <button
                        onClick={() => setPreview(p.screenshotUrl || p.screenshotData || null)}
                        className="font-semibold text-red-600 underline"
                      >
                        {p.screenshotName}
                      </button>
                    </MetaRow>
                  )}
                </>
              }
              actions={
                <>
                  <button
                    disabled={loadingId === p.id}
                    onClick={() => act(p.id, "registration", "approve")}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-green-600 px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-green-700 disabled:opacity-60"
                  >
                    {loadingId === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Approve
                  </button>
                  <button
                    disabled={loadingId === p.id}
                    onClick={() => act(p.id, "registration", "reject")}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-red-300 bg-white px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    <X className="h-4 w-4" />
                    Reject
                  </button>
                </>
              }
            />
          )}
        />
      )}

      {tab === "plans" && (
        <Section
          title="Pending Plan Payments"
          emptyText="No pending plan payments."
          items={pendingPlans}
          render={(p) => (
            <PaymentCard
              key={p.id}
              title={`${p.userName} — ${p.planName} Plan`}
              subtitle={`${p.userEmail} · ${p.userPhone || "—"}`}
              badge={`${p.currency} ${p.amount}`}
              meta={
                <>
                  <MetaRow icon={<Gem className="h-4 w-4" />} label="Plan">
                    {p.planName} ({p.planCode})
                  </MetaRow>
                  <MetaRow icon={<UserIcon className="h-4 w-4" />} label="User">
                    {p.userName} ({p.userEmail})
                  </MetaRow>
                  <MetaRow icon={<UserIcon className="h-4 w-4" />} label="Phone">
                    {p.userPhone}
                  </MetaRow>
                  <MetaRow
                    icon={<Clock className="h-4 w-4" />}
                    label="Submitted"
                  >
                    {p.createdAt
                      ? new Date(p.createdAt).toLocaleString()
                      : "—"}
                  </MetaRow>
                  <MetaRow
                    icon={<Receipt className="h-4 w-4" />}
                    label="Reference"
                  >
                    {p.transactionReference || "—"}
                  </MetaRow>
                  {p.screenshotName && (
                    <MetaRow
                      icon={<FileImage className="h-4 w-4" />}
                      label="Screenshot"
                    >
                      <button
                        onClick={() => setPreview(p.screenshotUrl || p.screenshotData || null)}
                        className="font-semibold text-red-600 underline"
                      >
                        {p.screenshotName}
                      </button>
                    </MetaRow>
                  )}
                </>
              }
              actions={
                <>
                  <button
                    disabled={loadingId === p.id}
                    onClick={() =>
                      act(p.id, "plan", "approve", p.planCode || null)
                    }
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-green-600 px-4 py-2.5 text-sm font-bold text-white shadow hover:bg-green-700 disabled:opacity-60"
                  >
                    {loadingId === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Approve {p.planName}
                  </button>
                  <button
                    disabled={loadingId === p.id}
                    onClick={() => act(p.id, "plan", "reject", p.planCode || null)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border-2 border-red-300 bg-white px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    <X className="h-4 w-4" />
                    Reject
                  </button>
                </>
              }
            />
          )}
        />
      )}

      {tab === "users" && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 hidden sm:table-cell">Email</th>
                <th className="px-4 py-3 hidden md:table-cell">Phone</th>
                <th className="px-4 py-3">Reg.</th>
                <th className="px-4 py-3">Plan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-slate-500"
                  >
                    No users yet.
                  </td>
                </tr>
              )}
              {recentUsers.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold">{u.fullName}</td>
                  <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">
                    {u.email}
                  </td>
                  <td className="px-4 py-3 text-slate-600 hidden md:table-cell">
                    {u.phone}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={u.registrationStatus} />
                  </td>
                  <td className="px-4 py-3">
                    {u.activePlan !== "none" ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-800">
                        {u.activePlan.toUpperCase()}
                      </span>
                    ) : u.planStatus === "pending" ? (
                      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                        PENDING {u.pendingPlan?.toUpperCase()}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold transition " +
        (active
          ? "bg-red-600 text-white shadow"
          : "text-slate-600 hover:bg-slate-100")
      }
    >
      {label}
      {typeof count === "number" && count > 0 && (
        <span
          className={
            "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold " +
            (active ? "bg-white text-red-600" : "bg-red-100 text-red-700")
          }
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Section<T>({
  title,
  emptyText,
  items,
  render,
}: {
  title: string;
  emptyText: string;
  items: T[];
  render: (item: T) => React.ReactNode;
}) {
  return (
    <div>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-500">
          {emptyText}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">{items.map(render)}</div>
      )}
    </div>
  );
}

function PaymentCard({
  title,
  subtitle,
  badge,
  meta,
  actions,
}: {
  title: string;
  subtitle: string;
  badge: string;
  meta: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold leading-tight">{title}</h3>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <span className="inline-flex rounded-full bg-red-50 px-3 py-1 text-sm font-black text-red-700">
          {badge}
        </span>
      </div>
      <div className="mt-4 space-y-1.5 text-sm text-slate-600">{meta}</div>
      <div className="mt-4 flex gap-2">{actions}</div>
    </div>
  );
}

function MetaRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <span className="font-semibold text-slate-500">{label}:</span>
      <span className="text-slate-800">{children}</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "approved")
    return (
      <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-800">
        Approved
      </span>
    );
  if (status === "rejected")
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800">
        Rejected
      </span>
    );
  return (
    <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
      Pending
    </span>
  );
}
