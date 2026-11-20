import { ArrowUpRight, Link2 } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import { PublicLinkNotice } from "@/components/PublicLinkNotice";
import type { PublicLinkStatus } from "@/lib/siteOrigin";

const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50";

export function AgentReferralPanel({ code, link, enabled, publicLinks, clicks, registered, approved }: {
  code: string;
  link: string | null;
  enabled: boolean;
  publicLinks: PublicLinkStatus;
  clicks: number;
  registered: number;
  approved: number;
}) {
  const shareable = Boolean(link && enabled && publicLinks === "ready");
  const blockedReason = enabled ? "No public referral link available" : "The administrator disabled this referral";

  return (
    <section className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div>
        <div className="flex items-center gap-2">
          <Link2 className="size-5 text-red-600" aria-hidden="true" />
          <h2 className="text-xl font-extrabold text-slate-900">Your referral link</h2>
        </div>
        <p className="mt-2 text-sm text-slate-600">Send this link to customers so their registration is credited to you.</p>
      </div>
      <PublicLinkNotice status={publicLinks} />
      {!enabled && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">Your referral link is disabled by the administrator.</p>}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 sm:p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer signup link</p>
        <p className="select-all break-all font-mono text-sm text-slate-800">{shareable ? link : "No shareable link available."}</p>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={link} disabled={!shareable} disabledReason={blockedReason} className={primary} />
          <CopyButton value={link} disabled={!shareable} disabledReason={blockedReason} label="Share link" shareTitle="Join Virtuals Pro" />
          {shareable && link && (
            <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 px-2 text-sm font-semibold text-slate-600 hover:text-red-700">
              Open link <ArrowUpRight className="size-4" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div><p className="text-xs font-bold uppercase tracking-wider text-slate-500">Referral code</p><p className="mt-1 select-all break-all font-mono text-sm font-bold">{code}</p></div>
        <CopyButton value={code} label="Copy code" />
      </div>
      <dl className="grid grid-cols-3 gap-2 sm:gap-4">
        {[["Link clicks", clicks], ["Registered referrals", registered], ["Approved payers", approved]].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-slate-50 p-2.5 sm:p-3">
            <dt className="text-xs text-slate-600">{label}</dt>
            <dd className="mt-1 text-lg font-extrabold tabular-nums text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
