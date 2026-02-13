import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const base = path.resolve('design-experiments/variants');
const files = [
  'option-a-control-room.html',
  'option-b-executive-clean.html',
  'option-c-analyst-hybrid.html',
];
const zooms = [80, 100, 125];

await mkdir('design-experiments/screenshots', { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1728, height: 1117 } });

for (const f of files) {
  const url = `file://${path.join(base, f)}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  for (const z of zooms) {
    await page.evaluate((zoom) => { document.body.style.zoom = `${zoom}%`; }, z);
    await page.waitForTimeout(250);
    const out = `design-experiments/screenshots/${f.replace('.html','')}-${z}.png`;
    await page.screenshot({ path: out, fullPage: true });
  }
}

await browser.close();
