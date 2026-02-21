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
const baseUrl = process.env.HA_URL || 'http://localhost:8123';
const dashboardBase = process.env.CANNABIS_DASHBOARD_BASE || '/lovelace-cannabis';
const views = [
  'nexus',
  'war-room',
  'command-center',
  'irrigation',
  'energy',
  'security',
  'climate',
  'weather',
  'agents',
];

const forbiddenNeedles = [
  'Beta Group Q&A Loop',
  'Raw Unused Channels',
  'Configuration error',
  'illegal operations',
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1728, height: 1117 } });

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

const page = await context.newPage();
const failures = [];

for (const view of views) {
  const url = `${baseUrl}${dashboardBase}/${view}`;
  let navError = null;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(7000);
  } catch (err) {
    navError = String(err);
  }

  const details = await page.evaluate((needles) => {
    const errorCards = Array.from(document.querySelectorAll('hui-error-card')).map((node) => {
      const root = node.shadowRoot ?? node;
      return (root.textContent || '').trim().replace(/\s+/g, ' ');
    });

    const html = document.documentElement?.innerText || '';
    const forbidden = needles.filter((needle) => html.includes(needle));
    return { errorCards, forbidden };
  }, forbiddenNeedles);

  const pass = !navError && details.errorCards.length === 0 && details.forbidden.length === 0;

  console.log(
    `view=${view} pass=${pass} nav_error=${navError ? 'yes' : 'no'} error_cards=${details.errorCards.length} forbidden_hits=${details.forbidden.length}`
  );

  if (!pass) {
    failures.push({
      view,
      url,
      navError,
      errorCards: details.errorCards,
      forbidden: details.forbidden,
    });
  }
}

await browser.close();

if (failures.length) {
  console.error('FAIL: cannabis clone QA detected issues');
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log('PASS: cannabis clone QA checks passed.');
