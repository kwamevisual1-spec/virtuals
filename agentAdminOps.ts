import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { agentService } from "@/lib/agentService";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase";
import { isSupabaseConfigured } from "@/lib/supabase";
import { agentContactLinks, publicLinkStatus } from "@/lib/siteOrigin";
import { hasReferralSigningSecret } from "@/lib/referrals";

export type OpResult = { status: number; body: Record<string, unknown> };

export function percent(value: unknown): number | null {
  const n = Number(value);
  return value !== "" && Number.isFinite(n) && n >= 0 && n <= 100 && Math.round(n * 100) === n * 100 ? n : null;
}

function tableError(error: { code?: string; message?: string }) {
  return error.code === "PGRST205" || /could not find the table|does not exist/i.test(error.message || "")
    ? "Agent tables are not installed yet. Run supabase/agents.sql in your Supabase SQL Editor."
    : error.message;
}

export async function listAgentsOp(sb: SupabaseClient, base: string | null): Promise<OpResult> {
  const { data: agents, error } = await sb.from("agents").select("*").order("created_at", { ascending: false });
  if (error) return { status: 503, body: { error: tableError(error) } };
  const { data: customers } = await sb.from("profiles").select("id,referred_agent_id,registration_status").not("referred_agent_id", "is", null);
  const { data: payments } = await sb.from("payments").select("id,user_id,referred_agent_id,status,payment_type,amount,approved_at,created_at,transaction_reference");
  const { data: commissions } = await sb.from("agent_commissions").select("agent_id,commission_amount,commission_percentage,status,payment_id,approved_at");
  const { data: profiles } = await sb.from("profiles").select("id,full_name,referred_agent_id,registration_status");
  return {
    status: 200,
    body: {
      agents: (agents || []).map((a) => ({
        ...a,
        ...agentContactLinks(base, a.agent_code),
        referrals: (customers || []).filter((c) => c.referred_agent_id === a.id).length,
        approvedCustomers: new Set((payments || []).filter((p) => p.referred_agent_id === a.id && p.status === "approved").map((p) => p.user_id)).size,
        earned: (commissions || []).filter((c) => c.agent_id === a.id && c.status === "approved").reduce((sum, c) => sum + Number(c.commission_amount), 0),
      })),
      publicLinks: publicLinkStatus(base),
      payments: payments || [],
      commissions: commissions || [],
      profiles: profiles || [],
    },
  };
}

export async function createAgentOp(sb: SupabaseClient, body: Record<string, any>, base: string | null): Promise<OpResult> {
  if (!base) {
    return { status: 503, body: { error: "Agent not created: no publicly shareable website URL is configured. Deploy the site on a public HTTPS address and set SITE_URL on the server, then redeploy." } };
  }
  if (!hasReferralSigningSecret()) {
    return { status: 503, body: { error: "Agent not created: referral signing is not configured. Set a stable server-only REFERRAL_SECRET (or SESSION_SECRET) and redeploy." } };
  }
  if (!isSupabaseConfigured()) {
    return { status: 503, body: { error: "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY." } };
  }
  const fullName = String(body.fullName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const username = String(body.username || "").trim() || null;
  const rate = percent(body.commissionPercentage);
  if (fullName.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || phone.length < 5 || rate === null || (username && !/^[a-zA-Z0-9_]{3,30}$/.test(username))) {
    return { status: 400, body: { error: "Enter a valid name, email, phone, username and commission percentage (0–100, up to two decimals)." } };
  }
  const password = String(body.password || "") || randomBytes(18).toString("base64url");
  if (password.length < 12) return { status: 400, body: { error: "Agent password must have at least 12 characters." } };

  const service = process.env.SUPABASE_SERVICE_ROLE_KEY ? agentService() : null;
  let userId = "";

  if (service) {
    const { data: created, error: authError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone, agent_account: true },
    });
    if (authError || !created.user) {
      const message = authError?.message || "Could not create agent.";
      return { status: 400, body: { error: /already|registered|exists/i.test(message) ? "An account with this email already exists." : message } };
    }
    userId = created.user.id;
  } else {
    // No service key: create the auth account through the public sign-up
    // endpoint on a throwaway client (never persisted, never touches cookies).
    const anon = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await anon.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, phone, agent_account: true } },
    });
    if (error) {
      return {
        status: 400,
        body: {
          error: /already|registered|exists/i.test(error.message)
            ? "An account with this email already exists."
            : /rate limit|too many/i.test(error.message)
              ? "Too many sign-ups in a short time. Wait a minute and try again."
              : error.message,
        },
      };
    }
    if (!data.user || (Array.isArray(data.user.identities) && data.user.identities.length === 0)) {
      return { status: 409, body: { error: "An account with this email already exists." } };
    }
    userId = data.user.id;
  }

  const code = `AG${randomBytes(7).toString("hex").toUpperCase()}`;
  try {
    // Admin-authenticated writes (admin RLS policies), no secret key required.
    const { error: profileError } = await sb
      .from("profiles")
      .update({ is_agent: true, registration_status: "approved", full_name: fullName, phone })
      .eq("id", userId);
    if (profileError) throw profileError;

    const { data: agent, error: agentError } = await sb
      .from("agents")
      .insert({ user_id: userId, agent_code: code, full_name: fullName, email, phone, username, commission_percentage: rate })
      .select()
      .single();
    if (agentError || !agent) throw agentError || new Error("Could not create agent record");

    const { error: auditError } = await sb.rpc("log_agent_action", {
      p_action: "agent_created",
      p_subject: agent.id,
      p_details: { email, commission_percentage: rate },
    });
    if (auditError) throw auditError;

    return {
      status: 200,
      body: {
        agent,
        publicLinks: publicLinkStatus(base),
        credentials: {
          email,
          password,
          ...agentContactLinks(base, code),
        },
      },
    };
  } catch (err) {
    if (service) await service.auth.admin.deleteUser(userId).catch(() => {});
    const message = err instanceof Error ? err.message : "Agent setup failed.";
    return {
      status: 500,
      body: {
        error: /could not find the table|does not exist|PGRST|schema cache/i.test(message)
          ? "Agent tables are not installed yet. Run supabase/agents.sql in your Supabase SQL Editor."
          : /row-level security|permission denied/i.test(message)
            ? "Your admin session could not write the agent record. Sign out, sign in again as the admin, and retry."
            : message,
      },
    };
  }
}

export async function updateAgentOp(sb: SupabaseClient, body: Record<string, any>): Promise<OpResult> {
  const id = String(body.id || "");
  if (!id) return { status: 400, body: { error: "Missing agent id." } };
  const { data: current } = await sb.from("agents").select("id").eq("id", id).maybeSingle();
  if (!current) return { status: 404, body: { error: "Agent not found" } };

  const patch: Record<string, unknown> = {};
  if (body.commissionPercentage !== undefined) {
    const rate = percent(body.commissionPercentage);
    if (rate === null) return { status: 400, body: { error: "Rate must be between 0 and 100 with at most two decimals." } };
    patch.commission_percentage = rate;
  }
  if (body.status !== undefined) {
    if (!["active", "suspended", "deleted"].includes(body.status)) return { status: 400, body: { error: "Invalid status" } };
    patch.status = body.status;
    if (body.status === "deleted") patch.referral_enabled = false;
  }
  if (body.referralEnabled !== undefined) patch.referral_enabled = Boolean(body.referralEnabled);
  if (body.fullName !== undefined) patch.full_name = String(body.fullName).trim();
  if (body.phone !== undefined) patch.phone = String(body.phone).trim();
  if (!Object.keys(patch).length) return { status: 400, body: { error: "Nothing to update" } };

  const { data, error } = await sb.rpc("manage_agent", { p_id: id, p_patch: patch });
  if (error) {
    return {
      status: 400,
      body: { error: tableError(error) },
    };
  }
  return { status: 200, body: { agent: data } };
}
