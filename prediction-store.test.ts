import assert from "node:assert/strict";
import { insertPredictionWithSchemaFallback, legacyPredictionRows } from "../src/lib/predictionStore";
import type { SupabaseClient } from "@supabase/supabase-js";

const fullRow = {
  user_id: "test-user",
  league: "VIRTUAL LEAGUE",
  home_team: "Hull City",
  away_team: "Bournemouth",
  pick: "Hull City (Home)",
  win_rate: 82,
  source_screenshot: "match.png",
  home_prob: 44.2,
  draw_prob: 24.6,
  away_prob: 31.2,
  confidence: 82,
  data_quality: "odds-verified",
  model_json: "{}",
};

async function main() {
const calls: string[] = [];
const mock = {
  from(table: string) {
    assert.equal(table, "predictions");
    return {
      insert(rows: Record<string, unknown>[]) {
        const isLegacy = calls.length > 0;
        calls.push(isLegacy ? "legacy" : "full");
        if (!isLegacy) {
          return Promise.resolve({ error: { code: "42703", message: "column predictions.home_prob does not exist" } });
        }
        return Promise.resolve({ error: null });
      },
    };
  },
};

const schema = await insertPredictionWithSchemaFallback(mock as unknown as SupabaseClient, [fullRow]);
assert.equal(schema, "legacy");
assert.deepEqual(calls, ["full", "legacy"]);

const legacy = legacyPredictionRows([fullRow]);
for (const forbidden of ["source_screenshot", "home_prob", "draw_prob", "away_prob", "confidence", "data_quality", "model_json"]) {
  assert.equal(forbidden in legacy[0], false, `${forbidden} must not be sent to an older table`);
}
for (const required of ["user_id", "league", "home_team", "away_team", "pick", "win_rate"]) {
  assert.ok(required in legacy[0]);
}

const failing = {
  from() {
    return { insert: () => Promise.resolve({ error: { code: "42501", message: "row level security" } }) };
  },
};
await assert.rejects(
  insertPredictionWithSchemaFallback(failing as unknown as SupabaseClient, [fullRow]),
  (error: any) => error.code === "42501"
);

console.log("Prediction persistence schema-fallback tests passed.");

}
main().catch((error)=>{console.error(error);process.exit(1);});
