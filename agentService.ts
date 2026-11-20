import { createClient } from "@supabase/supabase-js";
import { getSupabaseUrl } from "@/lib/supabase";

export function agentService() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY must be configured on the server to create agents and attach referrals.");
  return createClient(getSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
