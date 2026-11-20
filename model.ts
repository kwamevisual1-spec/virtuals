/**
 * Three-way (1X2) prediction model.
 *
 * Bookmaker-implied probabilities are computed from the odds and normalized
 * to remove the bookmaker margin (overround). They are then blended with a
 * baseline Poisson-style model (home-advantage prior) to produce the main
 * model probabilities. The three probabilities always total 100%.
 *
 * Honesty note: no live football-data provider is configured in this
 * environment, so "live form/xG/lineups" are NOT fetched and NOT fabricated.
 * Every result carries a dataQuality flag explaining exactly what was used.
 */

export type ThreeWay = { home: number; draw: number; away: number };

export type MatchAnalysis = {
  home: string;
  away: string;
  homeOdds: number | null;
  drawOdds: number | null;
  awayOdds: number | null;
  implied: ThreeWay | null;       // bookmaker-implied, margin removed
  overround: number | null;       // bookmaker margin as %
  model: ThreeWay;                // final model probabilities (sum 100)
  predicted: "1" | "X" | "2";
  confidence: number;             // 0-100
  dataQuality: "odds-verified" | "baseline-only" | "low";
  analysis: string;
  factors: string[];
};

const HOME_ADVANTAGE_PRIOR = 0.06; // baseline home edge used by the model
const MODEL_BLEND = 0.65;          // weight of market-implied probs in model

function normalize(p: number[]): number[] {
  const sum = p.reduce((a, b) => a + b, 0);
  if (sum <= 0) return [1 / 3, 1 / 3, 1 / 3];
  return p.map((x) => x / sum);
}

/** Baseline model: home-advantage tilted Poisson-style prior. */
function baselineModel(homeOdds: number | null, drawOdds: number | null, awayOdds: number | null): ThreeWay {
  // Without odds, start from a league-typical 1X2 distribution.
  const base = normalize([0.45 + HOME_ADVANTAGE_PRIOR, 0.26, 0.29 - HOME_ADVANTAGE_PRIOR]);
  let probs = base;
  if (homeOdds && awayOdds) {
    // Use the odds spread as a strength signal for the baseline too.
    const spread = Math.log(homeOdds) - Math.log(awayOdds); // >0 favors away
    const shift = Math.max(-0.12, Math.min(0.12, -spread * 0.08));
    probs = normalize([base[0] + shift, base[1], base[2] - shift]);
  }
  return { home: round2(probs[0] * 100), draw: round2(probs[1] * 100), away: round2(probs[2] * 100) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Bookmaker-implied probabilities with margin removed. */
export function impliedFromOdds(home: number, draw: number, away: number): { implied: ThreeWay; overround: number } {
  const raw = [1 / home, 1 / draw, 1 / away];
  const sum = raw.reduce((a, b) => a + b, 0);
  const overround = sum - 1;
  const n = normalize(raw);
  return {
    implied: { home: round2(n[0] * 100), draw: round2(n[1] * 100), away: round2(n[2] * 100) },
    overround: round2(overround * 100),
  };
}

function blend(a: ThreeWay, b: ThreeWay, w: number): ThreeWay {
  const h = a.home * w + b.home * (1 - w);
  const d = a.draw * w + b.draw * (1 - w);
  const aw = a.away * w + b.away * (1 - w);
  // renormalize to exactly 100 after rounding
  const sum = h + d + aw;
  const out = { home: round2((h / sum) * 100), draw: round2((d / sum) * 100), away: round2((aw / sum) * 100) };
  const drift = 100 - (out.home + out.draw + out.away);
  out.home = round2(out.home + drift);
  return out;
}

export function analyzeMatch(input: {
  home: string;
  away: string;
  homeOdds: number | null;
  drawOdds: number | null;
  awayOdds: number | null;
  verified: boolean;
}): MatchAnalysis {
  const { home, away, homeOdds, drawOdds, awayOdds, verified } = input;
  const hasOdds = [homeOdds, drawOdds, awayOdds].every((o) => typeof o === "number");

  let implied: ThreeWay | null = null;
  let overround: number | null = null;
  if (hasOdds) {
    const r = impliedFromOdds(homeOdds!, drawOdds!, awayOdds!);
    implied = r.implied;
    overround = r.overround;
  }

  const baseline = baselineModel(homeOdds, drawOdds, awayOdds);
  const model = implied ? blend(implied, baseline, MODEL_BLEND) : baseline;

  const predicted: "1" | "X" | "2" =
    model.home >= model.draw && model.home >= model.away
      ? "1"
      : model.away >= model.draw
        ? "2"
        : "X";

  const top = Math.max(model.home, model.draw, model.away);
  const second = [model.home, model.draw, model.away].sort((a, b) => b - a)[1];
  const confidence = Math.max(35, Math.min(97, Math.round(40 + (top - second) * 1.4 + (verified ? 8 : 0))));

  const dataQuality: MatchAnalysis["dataQuality"] = !hasOdds ? "baseline-only" : verified ? "odds-verified" : "low";

  const factors: string[] = [];
  if (implied) {
    factors.push(`Market implies ${implied.home}% / ${implied.draw}% / ${implied.away}% after removing a ${overround}% bookmaker margin.`);
  }
  factors.push("Baseline Poisson-style model adds a home-advantage prior.");
  factors.push("No live form/xG/lineup feed is configured, so live stats are not included.");

  const pickName = predicted === "1" ? home : predicted === "X" ? "Draw" : away;
  const analysis = `Model predicts ${pickName} (${predicted === "1" ? "HOME WIN" : predicted === "X" ? "DRAW" : "AWAY WIN"}) at ${top}% confidence ${confidence}%.`;

  return {
    home,
    away,
    homeOdds: hasOdds ? homeOdds : null,
    drawOdds: hasOdds ? drawOdds : null,
    awayOdds: hasOdds ? awayOdds : null,
    implied,
    overround,
    model,
    predicted,
    confidence,
    dataQuality,
    analysis,
    factors,
  };
}
