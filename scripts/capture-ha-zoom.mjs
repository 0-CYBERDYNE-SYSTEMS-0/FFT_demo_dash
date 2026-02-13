import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const views = [
  { name: 'command-center', path: 'command-center' },
  { name: 'irrigation', path: 'irrigation' },
  { name: 'energy', path: 'energy' },
  { name: 'security', path: 'security' },
  { name: 'climate', path: 'climate' },
  { name: 'agents', path: 'agents' },
];
const zooms = [80, 100, 125];

await mkdir('design-experiments/screenshots', { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1728, height: 1117 } });

for (const view of views) {
  await page.goto(`http://localhost:8123/lovelace/${view.path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);

  const url = page.url();
  if (url.includes('/auth/') || url.includes('/login')) {
    await page.screenshot({ path: `design-experiments/screenshots/${view.name}-login.png`, fullPage: true });
    continue;
  }

  for (const z of zooms) {
    await page.evaluate((zoom) => {
      document.body.style.zoom = `${zoom}%`;
    }, z);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `design-experiments/screenshots/${view.name}-${z}.png`, fullPage: true });
  }
}

await browser.close();
