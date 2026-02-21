import fs from 'node:fs';
import { chromium } from 'playwright';

function loadToken() {
  const content = fs.readFileSync('.env', 'utf8');
  const line = content
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('HA_TOKEN='));
  if (!line) throw new Error('Missing HA_TOKEN in .env');
  return line.slice('HA_TOKEN='.length).trim();
}

const token = loadToken();
const views = ['nexus', 'war-room', 'security', 'agents'];
const failures = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1728, height: 1117 } });
const page = await context.newPage();

await context.addInitScript((accessToken) => {
  const hassUrl = `${window.location.protocol}//${window.location.host}`;
  const clientId = `${window.location.protocol}//${window.location.host}/`;
  const tokens = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 315360000,
    expires: Date.now() + 315360000 * 1000,
    hassUrl,
    clientId,
  };
  window.localStorage.setItem('hassTokens', JSON.stringify(tokens));
}, token);

const badResponses = [];
page.on('response', (response) => {
  const url = response.url();
  if (!url.includes('video.nest.com/embedded/live/')) return;
  if (response.status() >= 400) {
    badResponses.push({ url, status: response.status() });
  }
});

for (const view of views) {
  const url = `http://localhost:8123/lovelace/${view}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(8000);

  const details = await (async () => {
    const iframeLocator = page.locator('iframe[src*=\"video.nest.com/embedded/live/\"]');
    const embedCount = await iframeLocator.count();
    const pageHtml = await page.content();
    const legacyRefs = [
      'camera.ops_north_gate_live',
      'camera.ops_greenhouse_live',
      'camera.ops_equipment_live',
    ].filter((needle) => pageHtml.includes(needle));
    return { embedCount, legacyRefs };
  })();

  const pass = details.embedCount > 0 && details.legacyRefs.length === 0;
  console.log(`view=${view} farm_embed_iframes=${details.embedCount} legacy_refs=${details.legacyRefs.length} pass=${pass}`);

  if (!pass) {
    failures.push({
      view,
      embedCount: details.embedCount,
      legacyRefs: details.legacyRefs,
    });
  }
}

await browser.close();

if (badResponses.length) {
  console.log(`farm_embed_http_errors=${badResponses.length}`);
  for (const item of badResponses.slice(0, 10)) {
    console.log(`error status=${item.status} url=${item.url}`);
  }
}

if (failures.length) {
  console.error('FAIL: embed QA detected issues');
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log('PASS: live embed QA checks passed.');
