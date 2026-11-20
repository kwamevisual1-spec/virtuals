import type { SupabaseClient } from "@supabase/supabase-js";

export type PredictionRow = Record<string, unknown>;

function isMissingColumn(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" || error.code === "PGRST204" || /column .* does not exist|schema cache/i.test(error.message || "");
}

/** Original prediction table fields used before probability columns were added. */
export function legacyPredictionRows(rows: PredictionRow[]): PredictionRow[] {
  return rows.map((row) => ({
    user_id: row.user_id,
    league: row.league,
    home_team: row.home_team,
    away_team: row.away_team,
    pick: row.pick,
    win_rate: row.win_rate,
  }));
}

/**
 * Persist analysis using the full schema when available, with a safe fallback
 * for existing production tables that only have the original columns.
 */
export async function insertPredictionWithSchemaFallback(
  supabase: SupabaseClient,
  rows: PredictionRow[]
): Promise<"full" | "legacy"> {
  const full = await supabase.from("predictions").insert(rows);
  if (!full.error) return "full";

  if (!isMissingColumn(full.error)) throw full.error;

  const legacy = await supabase
    .from("predictions")
    .insert(legacyPredictionRows(rows));
  if (legacy.error) throw legacy.error;
  return "legacy";
}
