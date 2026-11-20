"use server";

import { headers } from "next/headers";
import { getAdminSupabase } from "@/lib/adminAuth";
import { publicSiteOrigin } from "@/lib/siteOrigin";
import { createAgentOp, listAgentsOp, updateAgentOp, type OpResult } from "@/lib/agentAdminOps";

async function base() {
  return publicSiteOrigin(await headers());
}

const unauthorized: OpResult = {
  status: 403,
  body: { error: "Admin only. Sign out and sign back in with the admin account, then retry." },
};

export async function listAgentsAction(token: string): Promise<OpResult> {
  try {
    const sb = await getAdminSupabase(token);
    if (!sb) return unauthorized;
    return await listAgentsOp(sb, await base());
  } catch (err) {
    return { status: 500, body: { error: err instanceof Error ? err.message : "Could not load agents." } };
  }
}

export async function createAgentAction(payload: Record<string, unknown> & { accessToken?: string }): Promise<OpResult> {
  try {
    const sb = await getAdminSupabase(payload.accessToken as string | undefined);
    if (!sb) return unauthorized;
    return await createAgentOp(sb, payload, await base());
  } catch (err) {
    return { status: 500, body: { error: err instanceof Error ? err.message : "Could not create the agent." } };
  }
}

export async function updateAgentAction(payload: Record<string, unknown> & { accessToken?: string }): Promise<OpResult> {
  try {
    const sb = await getAdminSupabase(payload.accessToken as string | undefined);
    if (!sb) return unauthorized;
    return await updateAgentOp(sb, payload);
  } catch (err) {
    return { status: 500, body: { error: err instanceof Error ? err.message : "Could not update the agent." } };
  }
}
