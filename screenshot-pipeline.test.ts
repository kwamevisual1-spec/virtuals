import assert from "node:assert/strict";
import {
  parsePass,
  mergePasses,
  isVerified,
  cleanOcrText,
  isValidOdds,
  type OcrPass,
} from "../src/lib/screenshotPipeline";
import { analyzeMatch, impliedFromOdds } from "../src/lib/model";

// Simulated OCR pass for the user's example screenshot (3 fixtures, 9 odds).
const sampleText = `VIRTUAL LEAGUE 1
HUL vs BOU 2.94 3.94 2.19
+71
FUL vs NEW 1.99 3.56 3.74
+71
CRY vs LIV 2.56 3.71 2.56`;
const pass: OcrPass = { text: sampleText, words: [] };
const parsed = parsePass(pass);
assert.equal(parsed.fixtures.length, 3, "must detect exactly 3 fixtures, not 9");
assert.deepEqual(
  parsed.fixtures.map((f) => `${f.homeCode}-${f.awayCode}`),
  ["HUL-BOU", "FUL-NEW", "CRY-LIV"]
);
assert.deepEqual(
  parsed.fixtures.map((f) => [f.homeOdds, f.drawOdds, f.awayOdds]),
  [[2.94, 3.94, 2.19], [1.99, 3.56, 3.74], [2.56, 3.71, 2.56]]
);
assert.ok(parsed.fixtures.every(isVerified), "all sample fixtures verified");
assert.equal(parsed.league, "VIRTUAL LEAGUE 1");

// OCR noise cleanup
const noisy = cleanOcrText("HUL V5 BOU 2o94 3,94 2.19");
assert.match(noisy, /HUL VS BOU 2\.94 3\.94 2\.19/);

// Cross-pass agreement raises confidence
const pass2: OcrPass = { text: "HUL vs BOU 2.94 3.94 2.19\nFUL vs NEW 1.99 3.56 3.74\nCRY vs LIV 2.56 3.71 2.56", words: [] };
const merged = mergePasses([pass, pass2]);
assert.equal(merged.fixtures.length, 3);
assert.ok(merged.fixtures.every((f) => f.confidence === "high"), "cross-pass agreement = high confidence");

// Missing odds -> not verified, issue recorded
const partial = mergePasses([{ text: "ARS vs CHE", words: [] }]);
assert.equal(partial.fixtures.length, 1);
assert.equal(isVerified(partial.fixtures[0]), false);
assert.ok(partial.issues.some((i) => i.kind === "missing_odds"));

// Invalid odds -> not verified
const bad = mergePasses([{ text: "ARS vs CHE 0.50 3.10 99.99", words: [] }]);
assert.equal(isVerified(bad.fixtures[0]), false);
assert.ok(bad.issues.some((i) => i.kind === "invalid_odds"));

// Model: probabilities sum to 100 and predicted = argmax
const a = analyzeMatch({ home: "Hull City", away: "Bournemouth", homeOdds: 2.94, drawOdds: 3.94, awayOdds: 2.19, verified: true });
const sum = a.model.home + a.model.draw + a.model.away;
assert.ok(Math.abs(sum - 100) < 0.05, `model probs must total 100, got ${sum}`);
assert.equal(a.predicted, a.model.home >= a.model.draw && a.model.home >= a.model.away ? "1" : a.model.away >= a.model.draw ? "2" : "X");
assert.equal(a.dataQuality, "odds-verified");

// Margin removal: fair odds sum to 100
const imp = impliedFromOdds(2, 3.5, 4);
assert.ok(Math.abs(imp.implied.home + imp.implied.draw + imp.implied.away - 100) < 0.05);
assert.ok(imp.overround > 0, "typical odds carry a margin");

// No odds -> baseline only, clearly labeled
const b = analyzeMatch({ home: "Arsenal", away: "Chelsea", homeOdds: null, drawOdds: null, awayOdds: null, verified: false });
assert.equal(b.dataQuality, "baseline-only");
assert.ok(Math.abs(b.model.home + b.model.draw + b.model.away - 100) < 0.05);
assert.ok(b.factors.some((f) => f.includes("No live form/xG/lineup feed")));

// Blur-recovery is covered by tests/blur-recovery.test.ts, which exercises the real OCR pipeline.

console.log("Screenshot pipeline + 1X2 model tests passed.");
