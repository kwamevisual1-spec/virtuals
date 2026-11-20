import { Globe2 } from "lucide-react";
import type { PublicLinkStatus } from "@/lib/siteOrigin";

export function PublicLinkNotice({ status, admin = false }: { status?: PublicLinkStatus | null; admin?: boolean }) {
  if (!status || status === "ready") return null;
  const unpublished = status === "unpublished";

  return (
    <aside className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <Globe2 className="mt-0.5 size-5 shrink-0 text-amber-700" aria-hidden="true" />
      <div>
        <p className="font-bold">{unpublished ? "Public links unavailable" : "Referral tracking is not configured"}</p>
        <p className="mt-1 text-amber-900">
          {unpublished
            ? admin
              ? <>Arena/E2B sandbox links are preview-only. In Arena choose <strong>Deploy to Vercel</strong> (or another public HTTPS host), set server-only <code className="font-semibold">SITE_URL</code> to that deployed origin, then redeploy. Copied referral links work outside the builder only after this.</>
              : "This sandbox preview is private. Referral links will be available after the administrator deploys Virtuals Pro to a public HTTPS address."
            : admin
              ? <>Set a server-only <code className="font-semibold">REFERRAL_SECRET</code> or <code className="font-semibold">SESSION_SECRET</code> on the public host to turn on referral links.</>
              : "Ask the administrator to finish setting up referral tracking before sharing a link."}
        </p>
      </div>
    </aside>
  );
}
