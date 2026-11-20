/**
 * Prediction rules: daily plan limits, plus extracting and counting the
 * actual virtual matches from an uploaded screenshot's OCR text.
 */

export const PLAN_DAILY_LIMITS: Record<string, number> = {
  starter: 2,
  basic: 4,
  standard: 10,
  pro: 20,
  elite: 50,
};

export function dailyLimitForPlan(planCode: string | null | undefined): number | null {
  if (!planCode || planCode === "none") return null;
  return PLAN_DAILY_LIMITS[planCode] ?? null;
}

export function planAllowsMatches(planCode: string | null | undefined, count: number): boolean {
  const limit = dailyLimitForPlan(planCode);
  if (limit === null) return false;
  return count <= limit;
}

export type ExtractedMatch = {
  homeCode: string;
  awayCode: string;
  homeName: string;
  awayName: string;
  homeOdds?: number;
  drawOdds?: number;
  awayOdds?: number;
  pick: string;
  pickLabel: "Home Win" | "Away Win" | "Draw";
  pickSide: "home" | "away" | "draw";
  winRate: number;
  reason: string;
};

/** Well-known virtual football 3-letter team codes -> readable names. */
const TEAM_NAMES: Record<string, string> = {
  ARS: "Arsenal",
  AVL: "Aston Villa",
  BOU: "Bournemouth",
  BRE: "Brentford",
  BHA: "Brighton",
  BUR: "Burnley",
  CHE: "Chelsea",
  CRY: "Crystal Palace",
  EVE: "Everton",
  FUL: "Fulham",
  HUL: "Hull City",
  IPS: "Ipswich",
  LEE: "Leeds",
  LEI: "Leicester",
  LIV: "Liverpool",
  LUT: "Luton",
  MCI: "Man City",
  MUN: "Man Utd",
  NEW: "Newcastle",
  NFO: "Nottm Forest",
  NOR: "Norwich",
  SHU: "Sheffield Utd",
  SOU: "Southampton",
  TOT: "Tottenham",
  WAT: "Watford",
  WHU: "West Ham",
  WOL: "Wolves",
  BAY: "Bayern Munich",
  FEN: "Fenerbahce",
  OLM: "Marseille",
  INT: "Inter Milan",
  NAP: "Napoli",
  RMA: "Real Madrid",
  BAR: "Barcelona",
  ATM: "Atletico",
  PSG: "PSG",
  MON: "Monaco",
  DOR: "Dortmund",
  JUV: "Juventus",
  MIL: "AC Milan",
  ROM: "AS Roma",
  AJX: "Ajax",
  PSV: "PSV",
  SEV: "Sevilla",
  PAC: "Pacific FC",
  RAC: "Rapid City",
};

function teamDisplay(code: string): string {
  const up = code.toUpperCase();
  return TEAM_NAMES[up] || up;
}

/**
 * Extract the actual matches visible in a virtual-football screenshot's OCR text.
 *
 * Looks for lines like:
 *   HUL vs BOU   2.94  3.94  2.19
 *   FUL vs NEW   1.99  3.56  3.74
 *   CRY vs LIV   2.56  3.71  2.56
 */
export function extractMatchesFromText(text: string): ExtractedMatch[] {
  if (!text) return [];
  const results: ExtractedMatch[] = [];
  const seen = new Set<string>();

  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    // Match: 2-5 letter team code, "vs" / "v", 2-5 letter team code (tolerant of OCR noise)
    const m = /\b([A-Z]{2,5})\s+(?:VS|V\.?)\s+([A-Z]{2,5})\b/i.exec(rawLine);
    if (!m) continue;
    const homeCode = m[1].toUpperCase();
    const awayCode = m[2].toUpperCase();
    if (homeCode === "VS" || awayCode === "VS") continue;

    const key = `${homeCode}-${awayCode}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // Grab decimal odds on the same line (e.g. 2.94, 3.94, 2.19)
    const odds = (rawLine.match(/\b\d+\.\d{2}\b/g) || [])
      .map(Number)
      .filter((n) => n >= 1.01 && n <= 50);

    const homeOdds = odds[0];
    const drawOdds = odds[1];
    const awayOdds = odds[2];

    const homeName = teamDisplay(homeCode);
    const awayName = teamDisplay(awayCode);

    let pickSide: "home" | "away" | "draw" = "home";
    let pickLabel: "Home Win" | "Away Win" | "Draw" = "Home Win";
    let winRate = 89;
    let reason = `${homeCode} has been solid at home and has a better overall performance compared to ${awayCode}.`;

    if (homeOdds && awayOdds) {
      const diff = Math.abs(homeOdds - awayOdds);
      if (diff <= 0.08 && drawOdds && drawOdds <= 3.85) {
        pickSide = "draw";
        pickLabel = "Draw";
        winRate = 88;
        reason = `Both ${homeCode} and ${awayCode} are evenly matched on current form, making a tight Draw the strongest angle.`;
      } else if (awayOdds < homeOdds) {
        pickSide = "away";
        pickLabel = "Away Win";
        const gap = Math.min(1, Math.max(0, (homeOdds - awayOdds) / Math.max(homeOdds, 1)));
        winRate = Math.min(97, Math.max(85, Math.round(86 + gap * 11)));
        reason = `${awayCode} has a significantly stronger squad and recent form, making them favorites against ${homeCode}.`;
      } else {
        pickSide = "home";
        pickLabel = "Home Win";
        const gap = Math.min(1, Math.max(0, (awayOdds - homeOdds) / Math.max(awayOdds, 1)));
        winRate = Math.min(97, Math.max(85, Math.round(86 + gap * 11)));
        reason = `${homeCode} has been solid at home and holds a clear tactical advantage over ${awayCode}.`;
      }
    }

    const pick =
      pickSide === "draw"
        ? "Draw"
        : pickSide === "away"
          ? awayName
          : homeName;

    results.push({
      homeCode,
      awayCode,
      homeName,
      awayName,
      homeOdds,
      drawOdds,
      awayOdds,
      pick,
      pickLabel,
      pickSide,
      winRate,
      reason,
    });
  }

  return results;
}

/**
 * Count matches visible in OCR text WITHOUT counting decimal odds (like 2.94, 3.94, 2.19)!
 */
export function countMatchesFromText(text: string): number {
  if (!text) return 0;

  const extracted = extractMatchesFromText(text);
  if (extracted.length > 0) return extracted.length;

  const upper = text.toUpperCase();
  const vsCount = (upper.match(/\bVS\b/g) || []).length;
  if (vsCount > 0) return vsCount;

  // Strictly HH:MM (with colon), never decimal odds like 2.94
  const colonTimes = (upper.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g) || []).length;
  if (colonTimes > 0) return colonTimes;

  // Fallback: e.g. 9 decimal odds in 3 rows = 3 matches
  const oddsCount = (upper.match(/\b\d+\.\d{2}\b/g) || []).length;
  if (oddsCount >= 3) return Math.round(oddsCount / 3);

  return 0;
}

export function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* -------------------- local (offline) usage tracking -------------------- */

const USAGE_KEY = "vp_prediction_usage_v1";

type UsageMap = Record<string, number>;

export function readLocalUsage(): UsageMap {
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    return raw ? (JSON.parse(raw) as UsageMap) : {};
  } catch {
    return {};
  }
}

export function addLocalUsage(count: number): number {
  const key = todayKey();
  const usage = readLocalUsage();
  const next = (usage[key] || 0) + count;
  usage[key] = next;
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
  } catch {
    // storage unavailable
  }
  return next;
}
