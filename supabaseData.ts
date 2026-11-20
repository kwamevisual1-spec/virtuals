import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/auth";

/** Read a user's own profile row (allowed by RLS for the signed-in user). */
export async function fetchSupabaseProfile(
  client: SupabaseClient,
  uid: string,
  email: string
): Promise<SessionUser | null> {
  try {
    const { data, error } = await client
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();
    if (error || !data) return null;
    const p = data as Record<string, any>;
    return {
      id: p.id,
      fullName: p.full_name || "",
      email: p.email || email,
      phone: p.phone || "",
      country: p.country || "Ghana",
      countryFlag: p.country_flag || "GH",
      currency: p.currency || "GHS",
      registrationStatus: p.registration_status || "pending",
      activePlan: p.active_plan || "none",
      planStatus: p.plan_status || "none",
      pendingPlan: p.pending_plan || null,
      avatarInitial: p.avatar_initial || null,
      isAdmin: Boolean(p.is_admin),
      isAgent: Boolean(p.is_agent),
      createdAt: p.created_at || null,
    };
  } catch {
    return null;
  }
}
