"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { listAgentsAction, createAgentAction, updateAgentAction } from "./actions";
import { CopyButton } from "@/components/CopyButton";
import { PublicLinkNotice } from "@/components/PublicLinkNotice";
import type { PublicLinkStatus } from "@/lib/siteOrigin";
import { ArrowLeft, Plus, Users, BadgePercent, Wallet, ShieldCheck, Download, RefreshCw, Search, Eye } from "lucide-react";

type Agent = {
  id: string; user_id: string; agent_code: string; full_name: string; email: string; phone: string;
  username: string | null; commission_percentage: number; status: string; referral_enabled: boolean;
  referralLink: string | null; loginLink: string | null; referrals: number; approvedCustomers: number; earned: number;
  click_count: number; created_at: string;
};
type Payment = { id: number; user_id: string; referred_agent_id: string | null; status: string; payment_type: string; amount: string; approved_at?: string; created_at: string; transaction_reference: string | null };
type Commission = { payment_id: number; agent_id: string; commission_amount: string; commission_percentage: string; status: string; approved_at: string };
type Profile = { id: string; full_name: string; referred_agent_id: string | null; registration_status: string };
async function readJson(res: Response): Promise<any> {
  const raw = await res.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    const isHtml = /^\s*<(!doctype|html)/i.test(raw);
    const type = res.headers.get("content-type") || "unknown";
    const finalUrl = res.url ? new URL(res.url).pathname : "(unknown)";
    if (isHtml) {
      const title = (raw.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "").trim();
      const looksLikeSignIn = /sign\s*in|log\s*in|password/i.test(raw.slice(0, 4000));
      const hint = looksLikeSignIn
        ? "The server answered with a sign-in page. Your admin session was not sent with this request — sign out and sign in again, then retry."
        : "The server answered with a web page instead of the API. The deployed build may be missing the agent API, or a host/proxy is intercepting /api requests.";
      throw new Error(
        `${hint} (HTTP ${res.status}, type ${type}, final URL ${finalUrl}${title ? `, page "${title}"` : ""})`
      );
    }
    throw new Error(`Unexpected server response (HTTP ${res.status}, type ${type}).`);
  }
}

/** JSON POST/GET helper: always sends the admin token, never follows to a page silently. */
async function adminApi(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { Accept: "application/json", ...(init?.headers || {}) },
  });
  return { res, data: await readJson(res) };
}


/**
 * Agent operations use two transports so a single broken path can't block the
 * admin: the JSON API first, then the server action. Whatever fails, the admin
 * sees exactly what happened instead of a generic client error.
 */
async function runAgentOp(
  kind: "list" | "create" | "update",
  payload: Record<string, unknown>,
  token: string
): Promise<{ ok: boolean; data: any; problem: string }> {
  let apiProblem = "";
  try {
    const init: RequestInit =
      kind === "list"
        ? { cache: "no-store" }
        : {
            method: kind === "create" ? "POST" : "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, accessToken: token }),
          };
    const url =
      kind === "list" ? `/api/admin/agents?t=${encodeURIComponent(token)}` : "/api/admin/agents";
    const res = await fetch(url, { ...init, headers: { Accept: "application/json", ...(init.headers || {}) } });
    const data = await readJson(res);
    if (res.ok) return { ok: true, data, problem: "" };
    // A real, actionable backend answer (validation, RLS, missing table, etc.)
    return { ok: false, data, problem: String(data?.error || `Request failed (HTTP ${res.status}).`) };
  } catch (err) {
    apiProblem = err instanceof Error ? err.message : "API request failed.";
  }

  // Fallback transport: server action (posts to the page route).
  try {
    const result =
      kind === "list"
        ? await listAgentsAction(token)
        : kind === "create"
          ? await createAgentAction({ ...payload, accessToken: token })
          : await updateAgentAction({ ...payload, accessToken: token });
    if (result.status === 200) return { ok: true, data: result.body, problem: "" };
    return { ok: false, data: result.body, problem: String((result.body as any)?.error || "The server rejected the request.") };
  } catch (err) {
    const actionProblem = err instanceof Error ? err.message : "Server action failed.";
    return {
      ok: false,
      data: {},
      problem: `${apiProblem} Fallback also failed: ${actionProblem} If the page shows "Sandbox Expired" or a hosting page, the preview/deployment has ended — restart or redeploy, then retry.`,
    };
  }
}

const money = (n: number) => `GHS ${n.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function AgentManagement({ token }: { token: string }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [filters, setFilters] = useState({ agent: "", customer: "", type: "", payment: "", commission: "", from: "", to: "" });
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"agents" | "create" | "reports">("agents");
  const [selected, setSelected] = useState<Agent | null>(null);
  const [search, setSearch] = useState("");
  const [publicLinks, setPublicLinks] = useState<PublicLinkStatus | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string; loginLink: string | null; referralLink: string | null } | null>(null);
  const [rate, setRate] = useState("");
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const result = await runAgentOp("list", {}, token);
      const data = result.data as any;
      if (!result.ok) throw new Error(result.problem || "Could not load agents");
      setAgents(data.agents || []); setPayments(data.payments || []); setCommissions(data.commissions || []); setProfiles(data.profiles || []);
      setPublicLinks(data.publicLinks ?? "unpublished");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load agents"); }
    finally { setBusy(false); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setSaving(true); setError("");
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    try {
      const result = await runAgentOp("create", payload as Record<string, unknown>, token);
      const data = result.data as any;
      if (!result.ok) throw new Error(result.problem || "Could not create agent");
      setPublicLinks(data.publicLinks ?? "unpublished");
      setCredentials(data.credentials); setTab("agents"); setMessage("Agent created. Copy their credentials now; the password is only shown once."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create agent"); }
    finally { setSaving(false); }
  }
  async function change(agent: Agent, patch: Record<string, unknown>) {
    setSaving(true); setError("");
    try {
      const result = await runAgentOp("update", { id: agent.id, ...patch }, token);
      if (!result.ok) throw new Error(result.problem || "Update failed");
      setMessage("Agent updated successfully."); setSelected(null); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Update failed"); }
    finally { setSaving(false); }
  }
  async function reverse(payment: Payment) {
    if (!confirm(`Reverse payment #${payment.id}? Its commission will be marked reversed, not deleted.`)) return;
    setSaving(true); setError("");
    try {
      const { res, data } = await adminApi("/api/admin/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentId: payment.id, kind: payment.payment_type, action: "reverse", accessToken: token }) });
      if (!res.ok) throw new Error(data.error || "Reversal failed");
      setMessage(`Payment #${payment.id} reversed; financial history retained.`);
      await load();
    } catch(e) { setError(e instanceof Error ? e.message : "Reversal failed"); }
    finally { setSaving(false); }
  }
  const approved = payments.filter((p) => p.status === "approved");
  const total = approved.reduce((s, p) => s + Number(p.amount), 0);
  const attributed = approved.filter((p) => p.referred_agent_id).reduce((s, p) => s + Number(p.amount), 0);
  const earned = commissions.filter((c) => c.status === "approved").reduce((s, c) => s + Number(c.commission_amount), 0);
  const shown = agents.filter((a) => `${a.full_name} ${a.email} ${a.agent_code}`.toLowerCase().includes(search.toLowerCase()));
  const filteredPayments = payments.filter(p => {
    const c = commissions.find(row => row.payment_id === p.id);
    return (!filters.agent || p.referred_agent_id === filters.agent)
      && (!filters.customer || `${p.user_id} ${profiles.find(x => x.id === p.user_id)?.full_name || ""}`.toLowerCase().includes(filters.customer.toLowerCase()))
      && (!filters.type || p.payment_type === filters.type)
      && (!filters.payment || p.status === filters.payment)
      && (!filters.commission || (c?.status || "none") === filters.commission)
      && (!filters.from || p.created_at?.slice(0,10) >= filters.from)
      && (!filters.to || p.created_at?.slice(0,10) <= filters.to);
  });
  function exportCsv() {
    const head = "Agent ID,Agent,Payment ID,Amount,Commission,Status";
    const lines = filteredPayments.map((p) => {
      const c = commissions.find((row) => row.payment_id === p.id);
      const a = agents.find((row) => row.id === p.referred_agent_id);
      return [a?.agent_code || "", JSON.stringify(a?.full_name || ""), p.id, p.amount, c?.commission_amount || "0", c?.status || "none"].join(",");
    });
    const blob = new Blob([[head, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "virtuals-agent-commissions.csv"; link.click(); URL.revokeObjectURL(url);
  }
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><Link href={`/admin?t=${encodeURIComponent(token)}`} className="inline-flex items-center gap-1 text-sm font-semibold text-red-600"><ArrowLeft size={16}/> Back to Admin</Link><h1 className="mt-2 text-3xl font-extrabold tracking-tight">Agent Management</h1><p className="text-sm text-slate-500">Manage your network, referral activity and financial performance.</p></div><button onClick={() => { setTab("create"); setCredentials(null); }} className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-bold text-white hover:bg-red-700"><Plus size={18}/> Create agent</button></div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[["Agents", agents.filter(a => a.status === "active").length, Users], ["Approved payments", approved.length, ShieldCheck], ["Agent earnings", money(earned), Wallet], ["Platform share", money(total-earned), BadgePercent]].map(([label,value,Icon]) => { const I = Icon as typeof Users; return <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><I size={19} className="text-red-600"/><div className="mt-3 text-xl font-extrabold">{String(value)}</div><div className="text-xs font-medium text-slate-500">{String(label)}</div></div>; })}</div>
      <div className="flex flex-wrap gap-2">{(["agents","create","reports"] as const).map((v) => <button key={v} onClick={() => setTab(v)} className={`rounded-xl px-4 py-2 text-sm font-bold capitalize ${tab===v ? "bg-slate-900 text-white" : "bg-white text-slate-500 ring-1 ring-slate-200"}`}>{v === "agents" ? "All Agents" : v === "create" ? "Create New Agent" : "Commission Reports"}</button>)}</div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}{message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{message}</div>}
      <PublicLinkNotice status={publicLinks} admin />
      {credentials && <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5"><h2 className="font-bold text-amber-950">Share credentials privately — password shown only now</h2><div className="mt-3 grid gap-2 text-sm">{Object.entries({ ...credentials, loginLink: publicLinks === "unpublished" ? null : credentials.loginLink, referralLink: publicLinks === "ready" ? credentials.referralLink : null }).map(([k,v]) => <div key={k} className="flex flex-wrap items-center gap-2"><span className="w-28 font-semibold capitalize">{k.replace(/([A-Z])/g," $1")}</span><code className="max-w-full select-all break-all rounded bg-white px-2 py-1">{v || "Not available"}</code>{v && <CopyButton value={v} label={`Copy ${k === "loginLink" ? "login link" : k === "referralLink" ? "referral link" : k}`} iconOnly className="inline-flex size-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50" />}</div>)}</div><button onClick={() => setCredentials(null)} className="mt-4 text-sm font-semibold text-amber-800 underline">I have saved these details</button></div>}
      {tab === "create" && <form onSubmit={create} className="grid max-w-2xl gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2"><h2 className="sm:col-span-2 text-lg font-extrabold">New agent account</h2>{[["fullName","Full name","text"],["email","Email","email"],["phone","Phone number","tel"],["username","Username (optional)","text"],["commissionPercentage","Commission % (0–100)","number"],["password","Temporary password (min 12 characters)","text"]].map(([name,label,type]) => <label key={name} className="space-y-1 text-sm font-semibold text-slate-700">{label}<input name={name} type={type} required={!["username","password"].includes(name)} min={name === "commissionPercentage" ? 0 : undefined} max={name === "commissionPercentage" ? 100 : undefined} step={name === "commissionPercentage" ? ".01" : undefined} placeholder={name === "password" ? "Leave blank to generate securely" : ""} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-red-500"/></label>)}<button disabled={saving} className="sm:col-span-2 rounded-xl bg-red-600 py-3 font-bold text-white disabled:opacity-60">{saving ? "Creating..." : "Create agent and generate links"}</button></form>}
      {tab === "agents" && <><div className="flex items-center justify-between gap-3"><label className="flex max-w-sm flex-1 items-center gap-2 rounded-xl border bg-white px-3 py-2"><Search size={17} className="text-slate-400"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email or ID" className="w-full bg-transparent text-sm outline-none"/></label><button onClick={load} aria-label="Refresh agents" className="rounded-xl border bg-white p-2.5 text-red-600"><RefreshCw size={17}/></button></div>{busy ? <p className="py-10 text-center text-slate-500">Loading agents...</p> : shown.length === 0 ? <div className="rounded-2xl bg-white p-10 text-center text-slate-500">No agents found yet.</div> : <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table className="min-w-[1050px] w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{["Agent","Agent ID","Phone","Referral link","Rate","Referrals","Approved","Earned","Status","Created","Actions"].map(h => <th key={h} className="px-4 py-3 font-bold uppercase tracking-wider">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{shown.map(a => <tr key={a.id}><td className="px-4 py-4 font-bold">{a.full_name}<div className="font-normal text-slate-500">{a.email}</div></td><td className="px-4 font-mono">{a.agent_code}</td><td className="px-4">{a.phone}</td><td className="px-4"><CopyButton value={a.referralLink} disabled={publicLinks !== "ready" || a.status !== "active" || !a.referral_enabled} disabledReason="This referral link is unavailable" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45" /></td><td className="px-4 font-bold">{a.commission_percentage}%</td><td className="px-4">{a.referrals}</td><td className="px-4">{a.approvedCustomers}</td><td className="px-4 font-bold">{money(a.earned)}</td><td className="px-4"><span className={`rounded-full px-2 py-1 font-bold ${a.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{a.status}</span></td><td className="px-4 whitespace-nowrap">{new Date(a.created_at).toLocaleDateString()}</td><td className="px-4"><button onClick={() => { setSelected(a); setRate(String(a.commission_percentage)); setEditName(a.full_name); setEditPhone(a.phone); }} className="flex items-center gap-1 font-bold text-red-600"><Eye size={14}/> Manage</button></td></tr>)}</tbody></table></div>}</>}
      {selected && <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-4" onClick={() => setSelected(null)}><div onClick={e => e.stopPropagation()} className="mx-auto my-6 max-w-xl rounded-2xl bg-white p-6 shadow-xl"><div className="flex justify-between"><h2 className="text-xl font-extrabold">{selected.full_name}</h2><button onClick={() => setSelected(null)} aria-label="Close">✕</button></div><p className="text-sm text-slate-500">{selected.agent_code} · {selected.email} · {selected.phone}</p><p className="mt-4 text-sm text-slate-600">{selected.referrals} referrals · {selected.approvedCustomers} approved customers · {money(selected.earned)} earned · {selected.click_count} link clicks</p><div className="mt-4 select-all break-all rounded-xl bg-slate-50 p-3 text-xs">{publicLinks === "ready" && selected.referralLink ? selected.referralLink : "No public referral link available."}</div><div className="mt-4 flex flex-wrap gap-2"><a href={`/agent?as=${encodeURIComponent(selected.id)}&t=${encodeURIComponent(token)}`} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-bold text-white">Open agent portal</a><CopyButton value={selected.referralLink} label="Copy referral link" disabled={publicLinks !== "ready" || selected.status !== "active" || !selected.referral_enabled} disabledReason="This referral link is unavailable" /><CopyButton value={selected.loginLink} label="Copy agent login" disabled={publicLinks === "unpublished"} disabledReason="A public site URL is required" /></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><label className="text-xs font-bold">Full name<input value={editName} onChange={e=>setEditName(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><label className="text-xs font-bold">Phone<input value={editPhone} onChange={e=>setEditPhone(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label></div><button disabled={saving} onClick={() => change(selected,{fullName:editName,phone:editPhone})} className="mt-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-700">Save contact details</button><div className="mt-5 flex items-end gap-2"><label className="flex-1 text-xs font-bold">Commission percentage<input type="number" min="0" max="100" step=".01" value={rate} onChange={e => setRate(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2.5"/></label><button disabled={saving} onClick={() => change(selected,{ commissionPercentage: rate })} className="rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white">Save rate</button></div><div className="mt-4 flex flex-wrap gap-2">{selected.status === "active" ? <button onClick={() => change(selected,{ status:"suspended" })} className="rounded-xl bg-amber-100 px-3 py-2 text-sm font-bold text-amber-800">Suspend</button> : <button onClick={() => change(selected,{ status:"active" })} className="rounded-xl bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-800">Reactivate</button>}<button onClick={() => change(selected,{ referralEnabled: !selected.referral_enabled })} className="rounded-xl border px-3 py-2 text-sm font-bold">{selected.referral_enabled ? "Disable" : "Enable"} referral link</button><button onClick={() => { if (confirm("Archive this agent? Financial records remain intact.")) change(selected,{status:"deleted"}); }} className="rounded-xl border border-red-200 px-3 py-2 text-sm font-bold text-red-700">Archive agent</button></div><h3 className="mt-6 font-bold">Referred customers</h3><div className="mt-2 max-h-40 space-y-2 overflow-y-auto text-sm">{profiles.filter(p => p.referred_agent_id === selected.id).map(p => <div key={p.id} className="rounded-lg bg-slate-50 px-3 py-2">{p.full_name} · {p.id.slice(0,8)} · {p.registration_status}</div>)}{!profiles.some(p => p.referred_agent_id === selected.id) && <p className="text-slate-500">No referrals yet.</p>}</div><h3 className="mt-6 font-bold">Commission transactions</h3><div className="mt-2 max-h-48 space-y-2 overflow-y-auto text-sm">{commissions.filter(c => c.agent_id === selected.id).map(c => <div key={c.payment_id} className="rounded-lg bg-slate-50 px-3 py-2">Payment #{c.payment_id} · {money(Number(c.commission_amount))} · {c.status}</div>)}</div></div></div>}
      {tab === "reports" && <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-extrabold">Commission Overview</h2><button onClick={exportCsv} className="flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-bold"><Download size={16}/> Export filtered CSV</button></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Payments received",money(total)],["Attributed payments",money(attributed)],["Agent commissions",money(earned)],["Platform share",money(total-earned)],["Unassigned payments",money(total-attributed)],["Pending verification",payments.filter(p=>p.status==="pending").length],["Approved",approved.length],["Rejected",payments.filter(p=>p.status==="rejected").length]].map(([label,value])=><div key={String(label)} className="rounded-2xl border bg-white p-4"><div className="text-lg font-extrabold">{String(value)}</div><div className="text-xs text-slate-500">{String(label)}</div></div>)}</div>
        <div className="grid gap-2 rounded-2xl border bg-white p-4 sm:grid-cols-3 lg:grid-cols-4">
          <select aria-label="Filter agent" className="rounded-xl border px-3 py-2 text-sm" value={filters.agent} onChange={e=>setFilters({...filters,agent:e.target.value})}><option value="">All agents</option>{agents.map(a=><option key={a.id} value={a.id}>{a.full_name}</option>)}</select>
          <input aria-label="Filter customer" placeholder="Customer name or ID" className="rounded-xl border px-3 py-2 text-sm" value={filters.customer} onChange={e=>setFilters({...filters,customer:e.target.value})}/>
          <select aria-label="Filter payment type" className="rounded-xl border px-3 py-2 text-sm" value={filters.type} onChange={e=>setFilters({...filters,type:e.target.value})}><option value="">All payment types</option><option value="registration">Registration</option><option value="plan">Plan</option></select>
          <select aria-label="Filter payment status" className="rounded-xl border px-3 py-2 text-sm" value={filters.payment} onChange={e=>setFilters({...filters,payment:e.target.value})}><option value="">All payment statuses</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="reversed">Reversed</option></select>
          <select aria-label="Filter commission status" className="rounded-xl border px-3 py-2 text-sm" value={filters.commission} onChange={e=>setFilters({...filters,commission:e.target.value})}><option value="">All commission statuses</option><option value="approved">Approved</option><option value="reversed">Reversed</option><option value="none">No commission</option></select>
          <label className="text-xs text-slate-500">From<input type="date" className="block w-full rounded-xl border px-3 py-2 text-sm" value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/></label>
          <label className="text-xs text-slate-500">To<input type="date" className="block w-full rounded-xl border px-3 py-2 text-sm" value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/></label>
        </div>
        <div className="overflow-x-auto rounded-2xl border bg-white"><table className="min-w-[850px] w-full text-left text-sm"><thead className="bg-slate-50"><tr>{["Agent","Customer","Payment","Type","Amount","Payment status","Rate at approval","Commission","Commission status","Date","Action"].map(h=><th key={h} className="whitespace-nowrap px-3 py-3 text-xs">{h}</th>)}</tr></thead><tbody>{filteredPayments.map(p=>{const c=commissions.find(x=>x.payment_id===p.id);return <tr key={p.id} className="border-t"><td className="px-3 py-3">{agents.find(a=>a.id===p.referred_agent_id)?.full_name||"Unassigned"}</td><td className="px-3">{profiles.find(x=>x.id===p.user_id)?.full_name||p.user_id.slice(0,8)}</td><td className="px-3">#{p.id}</td><td className="px-3">{p.payment_type}</td><td className="px-3">{money(Number(p.amount))}</td><td className="px-3">{p.status}</td><td className="px-3">{c?.commission_percentage||"—"}%</td><td className="px-3">{c?money(Number(c.commission_amount)):"—"}</td><td className="px-3">{c?.status||"—"}</td><td className="px-3 whitespace-nowrap">{p.created_at?.slice(0,10)||"—"}</td><td className="px-3">{p.status==="approved"&&<button disabled={saving} onClick={()=>reverse(p)} className="font-bold text-red-600 disabled:opacity-50">Reverse</button>}</td></tr>})}</tbody></table>{filteredPayments.length===0&&<p className="p-6 text-center text-sm text-slate-500">No transactions match these filters.</p>}</div>
      </div>}
    </div>
  </main>;
}
