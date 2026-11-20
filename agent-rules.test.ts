import assert from "node:assert/strict";
import { countMatchesFromText, dailyLimitForPlan, planAllowsMatches, extractMatchesFromText } from "../src/lib/predictions";

const screenshot = "HUL vs BOU 2.94 3.94 2.19\nFUL vs NEW 1.99 3.56 3.74\nCRY vs LIV 2.56 3.71 2.56";
assert.equal(countMatchesFromText(screenshot), 3, "nine odds are three fixtures");
assert.deepEqual(extractMatchesFromText(screenshot).map(m => `${m.homeCode}-${m.awayCode}`), ["HUL-BOU", "FUL-NEW", "CRY-LIV"]);
assert.equal(dailyLimitForPlan("starter"), 2);
assert.equal(dailyLimitForPlan("basic"), 4);
assert.equal(planAllowsMatches("starter", 3), false);
assert.equal(planAllowsMatches("starter", 2), true);
assert.equal(planAllowsMatches("basic", 4), true);
assert.equal(planAllowsMatches("basic", 5), false);
assert.equal(planAllowsMatches("none", 1), false);
console.log("Agent-compatible plan and fixture rules passed.");
