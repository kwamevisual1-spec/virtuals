import assert from "node:assert/strict";
import sharpDefault from "sharp";

const sharp = sharpDefault;
import { extractFixturesFromImage, isVerified } from "../src/lib/screenshotPipeline";

const rows = [
  ["HUL", "BOU", "2.94", "3.94", "2.19"],
  ["FUL", "NEW", "1.99", "3.56", "3.74"],
  ["CRY", "LIV", "2.56", "3.71", "2.56"],
];

function tableSvg(): Buffer {
  const W = 900, H = 400;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="#fff"/>
  <text x="40" y="55" font-family="Arial" font-size="26" font-weight="bold" fill="#111">VIRTUAL LEAGUE 1</text>
  <text x="40" y="90" font-family="Arial" font-size="18" fill="#666">31 Aug · 20:45</text>
  ${rows.map((r, i) => {
    const y = 110 + i * 64;
    return `<text x="60" y="${y}" font-family="Arial" font-size="24" font-weight="bold" fill="#111">${r[0]}</text>
    <text x="150" y="${y}" font-family="Arial" font-size="20" fill="#888">vs</text>
    <text x="200" y="${y}" font-family="Arial" font-size="24" font-weight="bold" fill="#111">${r[1]}</text>
    <text x="560" y="${y}" font-family="Arial" font-size="24" font-weight="bold" fill="#0a7">${r[2]}</text>
    <text x="660" y="${y}" font-family="Arial" font-size="24" font-weight="bold" fill="#0a7">${r[3]}</text>
    <text x="760" y="${y}" font-family="Arial" font-size="24" font-weight="bold" fill="#0a7">${r[4]}</text>`;
  }).join("")}
  </svg>`;
  return Buffer.from(svg);
}

async function runVariant(name: string, make: (img: ReturnType<typeof sharp>) => ReturnType<typeof sharp>) {
  const img = make(sharp(tableSvg()));
  const dataUrl = "data:image/png;base64," + (await img.png().toBuffer()).toString("base64");
  const t0 = Date.now();
  const result = await extractFixturesFromImage(dataUrl);
  const verified = result.fixtures.filter(isVerified);
  console.log(`${name}: ${Date.now() - t0}ms, detected ${result.fixtures.length}, verified ${verified.length}`);
  assert.ok(verified.length >= 2, `${name}: expected at least 2 verified fixtures, got ${verified.length}`);
  assert.ok(result.fixtures.every(isVerified), `${name}: all fixtures must be verified`);
}

async function main() {
  await runVariant("gaussian-blur", (img) => img.blur(2.2));
  await runVariant("low-contrast", (img) => img.linear(0.45, 80));
  await runVariant("small-upscaled", (img) => img.resize({ width: 420 }).blur(0.8));
  await runVariant("tilted", (img) => img.rotate(-2, { background: "#fff" }));
  console.log("Blur/low-contrast/small/tilted recovery tests PASS");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(async()=>{ const { closeOcrWorkers } = await import("../src/lib/screenshotPipeline"); await closeOcrWorkers(); });
