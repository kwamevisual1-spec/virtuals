import assert from 'node:assert/strict';
import sharp from 'sharp';
import { extractFixturesFromImage, isVerified } from '../src/lib/screenshotPipeline';

async function main() {
const rows = [
  ['HUL','BOU','2.94','3.94','2.19'],
  ['FUL','NEW','1.99','3.56','3.74'],
  ['CRY','LIV','2.56','3.71','2.56'],
];
const rowH = 64, top = 110, W = 900, H = top + rows.length * rowH + 40;
const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<rect width="${W}" height="${H}" fill="#ffffff"/>
<text x="40" y="55" font-family="Arial" font-size="26" font-weight="bold" fill="#111">VIRTUAL LEAGUE 1</text>
<text x="40" y="90" font-family="Arial" font-size="18" fill="#666">31 Aug · 20:45</text>
${rows.map((r,i)=>{
  const y = top + i*rowH;
  return `<rect x="20" y="${y-38}" width="${W-40}" height="${rowH-8}" rx="10" fill="#f4faf4" stroke="#cde"/>
  <text x="60" y="${y}" font-family="Arial" font-size="24" font-weight="bold" fill="#111">${r[0]}</text>
  <text x="150" y="${y}" font-family="Arial" font-size="20" fill="#888">vs</text>
  <text x="200" y="${y}" font-family="Arial" font-size="24" font-weight="bold" fill="#111">${r[1]}</text>
  <text x="560" y="${y}" font-family="Arial" font-size="24" font-weight="bold" fill="#0a7">${r[2]}</text>
  <text x="660" y="${y}" font-family="Arial" font-size="24" font-weight="bold" fill="#0a7">${r[3]}</text>
  <text x="760" y="${y}" font-family="Arial" font-size="24" font-weight="bold" fill="#0a7">${r[4]}</text>`;
}).join('')}
</svg>`;
const img = await sharp(Buffer.from(svg)).png().toBuffer();
const dataUrl = 'data:image/png;base64,' + img.toString('base64');
const t0 = Date.now();
const result = await extractFixturesFromImage(dataUrl);
console.log('ms:', Date.now()-t0, 'passes:', result.passesRun, 'league:', result.league);
for (const f of result.fixtures) console.log(f.homeCode, 'vs', f.awayCode, f.homeOdds, f.drawOdds, f.awayOdds, 'verified:', isVerified(f), 'conf:', f.confidence);
assert.equal(result.fixtures.length, 3);
assert.ok(result.fixtures.every(isVerified));
console.log('E2E OCR pipeline PASS');

}
main().catch((e)=>{console.error(e);process.exitCode=1;}).finally(async()=>{ const { closeOcrWorkers } = await import("../src/lib/screenshotPipeline"); await closeOcrWorkers(); });
