/**
 * Server-side screenshot pipeline for the Smart Match Predictor.
 *
 * Stage order: preprocess image -> OCR (full frame + horizontal bands, with
 * word bounding boxes) -> align odds to fixture rows by y-coordinate ->
 * parse + validate -> return verified matches with 1X2 odds.
 *
 * The parsing/validation functions are pure so they can be unit-tested
 * without running OCR.
 */

export type OcrWord = { text: string; x: number; y: number; w: number; h: number };
export type OcrPass = { text: string; words: OcrWord[] };

export type FixtureRow = {
  homeCode: string;
  awayCode: string;
  homeName: string;
  awayName: string;
  homeOdds: number | null;
  drawOdds: number | null;
  awayOdds: number | null;
  league: string | null;
  datetime: string | null;
  rowY: number;
  confidence: "high" | "medium" | "low";
  issues: string[];
};

export type ParseIssue =
  | { kind: "duplicate"; detail: string }
  | { kind: "missing_odds"; detail: string }
  | { kind: "invalid_odds"; detail: string }
  | { kind: "teams_unverified"; detail: string }
  | { kind: "low_confidence"; detail: string };

export type ParsedScreenshot = {
  fixtures: FixtureRow[];
  issues: ParseIssue[];
  league: string | null;
  passesRun: number;
};

/* ------------------------------ team names ------------------------------ */

export const TEAM_NAMES: Record<string, string> = {
  ARS: "Arsenal", AVL: "Aston Villa", BOU: "Bournemouth", BRE: "Brentford",
  BHA: "Brighton", BUR: "Burnley", CHE: "Chelsea", CRY: "Crystal Palace",
  EVE: "Everton", FUL: "Fulham", HUL: "Hull City", IPS: "Ipswich",
  LEE: "Leeds", LEI: "Leicester", LIV: "Liverpool", LUT: "Luton",
  MCI: "Man City", MUN: "Man Utd", NEW: "Newcastle", NFO: "Nottm Forest",
  NOR: "Norwich", SHU: "Sheffield Utd", SOU: "Southampton", TOT: "Tottenham",
  WAT: "Watford", WHU: "West Ham", WOL: "Wolves", BAY: "Bayern Munich",
  FEN: "Fenerbahce", OLM: "Marseille", INT: "Inter Milan", NAP: "Napoli",
  RMA: "Real Madrid", BAR: "Barcelona", ATM: "Atletico", PSG: "PSG",
  MON: "Monaco", DOR: "Dortmund", JUV: "Juventus", MIL: "AC Milan",
  ROM: "AS Roma", AJX: "Ajax", PSV: "PSV", SEV: "Sevilla", PAC: "Pacific FC",
  RAC: "Rapid City",
};

export function teamDisplay(token: string): string {
  const up = token.toUpperCase().replace(/[^A-Z]/g, "");
  return TEAM_NAMES[up] || token.replace(/[_]+/g, " ").trim();
}

/* ------------------------------ OCR cleanup ----------------------------- */

const OCR_FIXES: Array<[RegExp, string]> = [
  [/\bV5\b/gi, "VS"],
  [/\bVS?\./gi, "VS"],
  [/\bV1S\b/gi, "VS"],
  [/\bV S\b/gi, "VS"],
  [/\bVl5\b/gi, "VS"],
  [/\bVS?\s+(?=\w)/g, "VS "],
  [/\b(\d)[oO](\d{2})\b/g, "$1.$2"],       // 2o94 -> 2.94
  [/\b(\d)[sS](\d{2})\b/g, "$1.$2"],       // 2s94 -> 2.94
  [/(\d),(\d{2})\b/g, "$1.$2"],            // 2,94 -> 2.94
  [/\b(\d)\s+(\d{2})\b/g, "$1.$2"],        // "2 94" -> 2.94 (only when adjacent)
  [/\bO(?=\d)/g, "0"],                    // letter O before a digit
  [/(?<=\d)O/g, "0"],                     // letter O after a digit
  [/(?<=\d)[lI](?=\d)/g, "1"],            // l/I between digits
];

export function cleanOcrText(text: string): string {
  let t = text.replace(/[|¦]/g, " ").replace(/[’‘`]/g, "'");
  for (const [re, sub] of OCR_FIXES) t = t.replace(re, sub);
  return t;
}

/* --------------------------- odds / row parsing -------------------------- */

const ODDS_RE = /\b(\d{1,2})[.,](\d{2})\b/g;
const TIME_RE = /\b([01]?\d|2[0-3]):[0-5]\d\b/;
const DATE_RE = /\b(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?\b/;
const VS_RE = /\b([A-Z]{2,5})\s+(?:VS|V5|V|vs|v5)\s+([A-Z]{2,5})\b/i;
const LEAGUE_RE = /(VIRTUAL\s+[A-Z][A-Z \d]+)/i;

export function isValidOdds(n: number): boolean {
  return Number.isFinite(n) && n >= 1.01 && n <= 99.99;
}

/**
 * Parse fixtures from one OCR pass. When word boxes are available, odds are
 * assigned to the fixture row whose vertical center is closest — this is what
 * prevents odds being attached to the wrong match when the table is small.
 */
function codeFromText(token: string): string | null {
  const raw = token.toUpperCase().replace(/[^A-Z]/g, "");
  if (raw.length < 2 || raw.length > 5) return null;
  if (["VS", "V", "V5", "VS.", "X", "1", "2"].includes(raw)) return null;
  if (TEAM_NAMES[raw]) return raw;
  // Fuzzy matching against known virtual-team codes: tolerate one OCR mistake
  // (for example BOV -> BOU, WV -> LIV).
  let best: { code: string; score: number } | null = null;
  for (const code of Object.keys(TEAM_NAMES)) {
    if (Math.abs(code.length - raw.length) > 1) continue;
    let score = 0;
    const a = raw, b = code;
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    const distance = dp[m][n];
    const allowed = code.length <= 3 ? 1 : 1;
    if (distance <= allowed && (!best || distance < best.score)) best = { code, score: distance };
  }
  return best?.code || null;
}

function normalizeCode(token: string): string {
  return codeFromText(token) || token.toUpperCase().replace(/[^A-Z]/g, "");
}

function parseOddsToken(token: string): number | null {
  const t = token.trim().replace(/[Oo]/g, "0").replace(/[Ss]/g, "5").replace(/[lI]/g, "1").replace(",", ".");
  // Common blurred decimal forms: 294 -> 2.94, 39% -> 3.94, 356 -> 3.56.
  if (/^\d{2}$/.test(t)) return Number(t);
  if (/^\d{3}$/.test(t)) {
    const n = Number(`${t[0]}.${t.slice(1)}`);
    return isValidOdds(n) ? n : null;
  }
  if (/^\d{4}$/.test(t)) {
    const n = Number(`${t.slice(0, 2)}.${t.slice(2)}`);
    return isValidOdds(n) ? n : null;
  }
  const m = /^(\d{1,2})[.\s]?(\d{2})$/.exec(t);
  if (m) {
    const n = Number(`${m[1]}.${m[2]}`);
    return isValidOdds(n) ? n : null;
  }
  return null;
}

function oddsInLine(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(ODDS_RE)) {
    const n = Number(`${m[1]}.${m[2]}`);
    if (isValidOdds(n)) out.push(n);
  }
  return out;
}

/**
 * Parse fixtures from one OCR pass. When word boxes are available, odds are
 * assigned to the fixture row whose vertical center is closest — this is what
 * prevents odds being attached to the wrong match when the table is small.
 */
export function parsePass(pass: OcrPass): { fixtures: FixtureRow[]; league: string | null } {
  const text = cleanOcrText(pass.text);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fixtures: FixtureRow[] = [];
  let league: string | null = null;
  const seen = new Set<string>();
  const words = pass.words.map((w) => ({ ...w, text: cleanOcrText(w.text) }));

  for (const line of lines) {
    const lm = LEAGUE_RE.exec(line);
    if (lm && !league) league = lm[1].replace(/\s+/g, " ").toUpperCase();
    const vm = VS_RE.exec(line) || /\b([A-Z]{3})\s*(?:VS|V5)\s*([A-Z]{3})\b/i.exec(line);
    if (!vm) continue;
    const homeCode = normalizeCode(vm[1]);
    const awayCode = normalizeCode(vm[2]);
    if (!homeCode || !awayCode || homeCode === awayCode) continue;
    const key = `${homeCode}-${awayCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const odds = oddsInLine(line);
    const time = TIME_RE.exec(line)?.[0] || null;
    const date = DATE_RE.exec(line)?.[0] || null;
    const vsWord = words.find((w) => /vs/i.test(w.text) && line.toUpperCase().includes(w.text.toUpperCase()));
    const rowY = vsWord ? vsWord.y + vsWord.h / 2 : 0;
    fixtures.push({
      homeCode, awayCode, homeName: teamDisplay(homeCode), awayName: teamDisplay(awayCode),
      homeOdds: odds[0] ?? null, drawOdds: odds[1] ?? null, awayOdds: odds[2] ?? null,
      league, datetime: [date, time].filter(Boolean).join(" ") || null,
      rowY, confidence: "medium", issues: [],
    });
  }

  if (words.length > 0) {
    const teamWords: Array<OcrWord & { text: string }> = words
      .map((w) => ({ ...w, text: normalizeCode(w.text.trim()) }))
      .filter((w): w is OcrWord & { text: string } => Boolean(w.text));
    const oddsWords = words
      .map((w) => ({ w, n: parseOddsToken(w.text) }))
      .filter((x): x is { w: OcrWord; n: number } => x.n !== null);
    const groups: Array<Array<OcrWord & { text: string; cy: number }>> = [];
    for (const w of teamWords) {
      const entry = { ...w, cy: w.y + w.h / 2 };
      const group = groups.find((g) => Math.abs(g[0].cy - entry.cy) < 32);
      if (group) group.push(entry);
      else groups.push([entry]);
    }
    for (const group of groups) {
      group.sort((a, b) => a.x - b.x);
      if (group.length < 2) continue;
      const home = group[0].text, away = group[1].text;
      if (!home || !away || home === away || home === "VS" || away === "VS") continue;
      const key = `${home}-${away}`;
      if (seen.has(key)) continue;
      const cy = group.reduce((sum, e) => sum + e.cy, 0) / group.length;
      const near = oddsWords
        .map((x) => ({ ...x, d: Math.abs(x.w.y + x.w.h / 2 - cy) }))
        .filter((x) => x.d < 36)
        .sort((a, b) => a.w.x - b.w.x)
        .slice(0, 3);
      if (near.length !== 3) continue;
      seen.add(key);
      fixtures.push({
        homeCode: home, awayCode: away,
        homeName: teamDisplay(home), awayName: teamDisplay(away),
        homeOdds: near[0].n, drawOdds: near[1].n, awayOdds: near[2].n,
        league, datetime: null, rowY: cy, confidence: "low",
        issues: ["Recovered from blurry text layout"],
      });
    }
  }
  return { fixtures, league };
}

/** Merge multiple OCR passes: union of fixtures, cross-pass verification. */
export function mergePasses(passes: OcrPass[]): ParsedScreenshot {
  const byKey = new Map<string, FixtureRow>();
  let league: string | null = null;
  let passesRun = passes.length;

  for (const pass of passes) {
    const { fixtures, league: lg } = parsePass(pass);
    if (lg && !league) league = lg;
    for (const f of fixtures) {
      const key = `${f.homeCode}-${f.awayCode}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, f);
        continue;
      }
      // Cross-pass agreement: both passes saw this fixture.
      existing.confidence = "high";
      // Prefer the pass that has odds.
      if (!(existing.homeOdds && existing.drawOdds && existing.awayOdds) && f.homeOdds && f.drawOdds && f.awayOdds) {
        existing.homeOdds = f.homeOdds;
        existing.drawOdds = f.drawOdds;
        existing.awayOdds = f.awayOdds;
      }
      if (!existing.league && f.league) existing.league = f.league;
      if (!existing.datetime && f.datetime) existing.datetime = f.datetime;
    }
  }

  const issues: ParseIssue[] = [];
  const fixtures = [...byKey.values()].sort((a, b) => a.rowY - b.rowY);

  // Collapse fuzzy duplicates: one OCR pass may read "BOV" and another "BOU".
  const unique: FixtureRow[] = [];
  for (const fixture of fixtures) {
    const duplicate = unique.find((other) => {
      if (Math.abs(other.rowY - fixture.rowY) >= 36) return false;
      const sameTeams =
        other.homeCode === fixture.homeCode && other.awayCode === fixture.awayCode;
      const swapped = other.homeCode === fixture.awayCode && other.awayCode === fixture.homeCode;
      return sameTeams || swapped;
    });
    if (duplicate) {
      if (fixture.confidence === "high") duplicate.confidence = "high";
      continue;
    }
    unique.push(fixture);
  }

  const final: FixtureRow[] = [];
  for (const f of fixtures) {
    const odds = [f.homeOdds, f.drawOdds, f.awayOdds];
    const present = odds.filter((o) => o !== null) as number[];
    if (present.length === 0) {
      issues.push({ kind: "missing_odds", detail: `${f.homeCode} vs ${f.awayCode}` });
      f.issues.push("No odds detected");
      f.confidence = "low";
      final.push(f);
      continue;
    }
    if (present.length < 3 || present.some((o) => !isValidOdds(o))) {
      issues.push({ kind: "invalid_odds", detail: `${f.homeCode} vs ${f.awayCode}: ${odds.map((o) => (o === null ? "?" : o)).join(" / ")}` });
      f.issues.push("Odds missing or invalid");
      f.confidence = f.confidence === "high" ? "medium" : "low";
      final.push(f);
      continue;
    }
    if (f.confidence !== "high") {
      issues.push({ kind: "low_confidence", detail: `${f.homeCode} vs ${f.awayCode}` });
    }
    final.push(f);
  }

  return { fixtures: final, issues, league, passesRun };
}

/** A fixture is "verified" when both teams and all three odds are valid. */
export function isVerified(f: FixtureRow): boolean {
  return (
    Boolean(f.homeCode && f.awayCode && f.homeCode !== f.awayCode) &&
    [f.homeOdds, f.drawOdds, f.awayOdds].every((o) => o !== null && isValidOdds(o))
  );
}

/* --------------------- image preprocessing (sharp) ----------------------- */

let sharp: any = null;
async function getSharp() {
  if (!sharp) sharp = (await import("sharp")).default;
  return sharp;
}

export type PreprocessPass = {
  image: Buffer;
  scale: number;
  top: number;
  left: number;
  width: number;
  height: number;
  label: string;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Preprocess the original image into several OCR-friendly variants. Blurry,
 * low contrast, and badly exposed screenshots need different treatments, so
 * the OCR stage can vote between normal, sharpened, and binarized versions.
 */
export async function preprocessImage(dataUrl: string): Promise<PreprocessPass[]> {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/i.exec(dataUrl);
  if (!m) throw new Error("UNSUPPORTED_IMAGE");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 8 * 1024 * 1024) throw new Error("IMAGE_TOO_LARGE");
  const s = await getSharp();
  const img = s(buf, { density: 220 }).rotate(); // normalize EXIF orientation
  const meta = await img.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (!width || !height) throw new Error("UNREADABLE_IMAGE");

  const source = img.clone();
  const scale = width < 1800 ? 2 : width < 3000 ? 1.5 : 1;
  const base = source.clone().grayscale().normalize();
  const enhanced = base
    .clone()
    .modulate({ brightness: 1.05 })
    .linear(1.18, -10)
    .sharpen({ sigma: 1.1, m1: 1, m2: 0.25 });

  const passes: PreprocessPass[] = [];
  async function push(image: any, top: number, label: string) {
    passes.push({
      image: await image.png().toBuffer(),
      scale,
      top,
      left: 0,
      width,
      height: meta.height || height,
      label,
    });
  }

  // Full-frame variants: standard, enhanced contrast/sharpening, and threshold.
  await push(base.clone().resize({ width: Math.round(width * scale) }), 0, "full-normal");
  await push(enhanced.clone().resize({ width: Math.round(width * scale) }), 0, "full-enhanced");
  await push(
    base.clone().resize({ width: Math.round(width * scale) }).threshold(150),
    0,
    "full-binarized"
  );

  // Bands retain local detail when the betting table is only part of the image.
  const bandCount = clamp(Math.ceil(height / 300), 1, 6);
  for (let i = 0; i < bandCount; i++) {
    const top = Math.max(0, Math.floor((height * i) / bandCount) - 48);
    const h = Math.min(height - top, Math.ceil(height / bandCount) + 96);
    if (h < 90) continue;
    const band = enhanced
      .clone()
      .extract({ left: 0, top, width, height: h })
      .resize({ width: Math.round(width * scale) });
    await push(band, top, `band-${i}`);
  }

  // Thresholded full image often recovers faint or blurry decimal odds.
  await push(
    enhanced.clone().resize({ width: Math.round(width * scale) }).threshold(180),
    0,
    "full-threshold-180"
  );
  return passes;
}

/* ------------------------------ OCR runner ------------------------------ */

// Tesseract workers are expensive to initialize (WASM + language data). Reuse
// two workers across scans instead of starting a new worker for every image.
type OcrWorker = Tesseract.Worker;
let workersPromise: Promise<OcrWorker[]> | null = null;
const idleWorkers: OcrWorker[] = [];
const workerWaiters: Array<(worker: OcrWorker) => void> = [];

async function initializeOcrWorkers(): Promise<OcrWorker[]> {
  const Tesseract = (await import("tesseract.js")).default;
  const created = await Promise.all([
    Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, { cacheMethod: "write" }),
    Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, { cacheMethod: "write" }),
  ]);
  idleWorkers.push(...created);
  return created;
}

async function getOcrWorker(): Promise<OcrWorker> {
  const available = idleWorkers.pop();
  if (available) return available;
  if (!workersPromise) {
    workersPromise = initializeOcrWorkers().catch((error) => {
      workersPromise = null;
      throw error;
    });
  }
  await workersPromise;
  const ready = idleWorkers.pop();
  if (ready) return ready;
  return new Promise<OcrWorker>((resolve) => workerWaiters.push(resolve));
}

function releaseOcrWorker(worker: OcrWorker) {
  const next = workerWaiters.shift();
  if (next) next(worker);
  else idleWorkers.push(worker);
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  if (ms <= 0) throw new Error("OCR_TIMEOUT");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("OCR_TIMEOUT")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runOcr(variant: PreprocessPass, deadline: number): Promise<OcrPass> {
  const worker = await withTimeout(getOcrWorker(), deadline - Date.now());
  try {
    const res = await withTimeout(
      worker.recognize(variant.image, {}, {
        text: true,
        blocks: true,
        layoutBlocks: false,
        hocr: true,
        tsv: true,
        box: false,
        unlv: false,
        osd: false,
        pdf: false,
        imageColor: false,
        imageGrey: false,
        imageBinary: false,
        debug: false,
      }),
      deadline - Date.now()
    );
    const data = res.data as any;
    const words: OcrWord[] = (data.words || [])
      .filter((w: any) => w.text && w.text.trim())
      .map((w: any) => ({
        text: String(w.text),
        x: variant.left + (w.bbox?.x0 ?? 0) / variant.scale,
        y: variant.top + (w.bbox?.y0 ?? 0) / variant.scale,
        w: ((w.bbox?.x1 ?? 0) - (w.bbox?.x0 ?? 0)) / variant.scale,
        h: ((w.bbox?.y1 ?? 0) - (w.bbox?.y0 ?? 0)) / variant.scale,
      }));
    return { text: String(data.text || ""), words };
  } finally {
    releaseOcrWorker(worker);
  }
}

async function scanVariants(variants: PreprocessPass[], deadline: number): Promise<OcrPass[]> {
  return Promise.all(
    variants.map(async (variant) => {
      try {
        return await runOcr(variant, deadline);
      } catch (error) {
        if (variant.label === "full-normal") throw error;
        return null;
      }
    })
  ).then((passes) => passes.filter((pass): pass is OcrPass => Boolean(pass)));
}

function confidentlyComplete(parsed: ParsedScreenshot): boolean {
  return parsed.fixtures.length > 0 && parsed.fixtures.every(
    (fixture) => isVerified(fixture) && fixture.confidence === "high"
  );
}

/** Full pipeline: image buffer -> verified fixtures. Throws coded errors. */
export async function extractFixturesFromImage(dataUrl: string, opts?: { timeoutMs?: number }): Promise<ParsedScreenshot> {
  const timeoutMs = opts?.timeoutMs ?? 45000;
  const deadline = Date.now() + timeoutMs;
  const images = await preprocessImage(dataUrl);
  const passes: OcrPass[] = [];

  try {
    passes.push(...(await scanVariants(images.slice(0, 2), deadline)));
    let parsed = mergePasses(passes);
    if (confidentlyComplete(parsed)) return parsed;

    for (let index = 2; index < images.length; index += 2) {
      if (Date.now() >= deadline) break;
      passes.push(...(await scanVariants(images.slice(index, index + 2), deadline)));
      parsed = mergePasses(passes);
      if (confidentlyComplete(parsed)) return parsed;
    }

    if (parsed.fixtures.some(isVerified)) {
      parsed.issues.push({ kind: "low_confidence", detail: "Additional enhancement passes were skipped to keep results responsive." });
      return parsed;
    }
    throw new Error("NO_MATCHES");
  } catch (error) {
    if (error instanceof Error && error.message === "OCR_TIMEOUT" && passes.length > 0) {
      const partial = mergePasses(passes);
      if (partial.fixtures.some(isVerified)) {
        partial.issues.push({ kind: "low_confidence", detail: "The scan reached its time budget; verified matches are shown." });
        return partial;
      }
    }
    throw error;
  }
}


/** Terminate pooled OCR workers when a one-off script or test finishes. */
export async function closeOcrWorkers(): Promise<void> {
  if (!workersPromise) return;
  const workers = await workersPromise;
  workersPromise = null;
  idleWorkers.length = 0;
  workerWaiters.length = 0;
  await Promise.allSettled(workers.map((worker) => worker.terminate()));
}
