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
page.on('console', (msg) => {
  if (msg.type() === 'error' || msg.type() === 'warning') {
    console.log(`[console:${msg.type()}] ${msg.text()}`);
  }
});
page.on('pageerror', (err) => {
  console.log(`[pageerror] ${err.message}`);
});

for (const view of views) {
  console.log(`\n=== ${view} ===`);
  await page.goto(`http://localhost:8123/lovelace/${view}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await page.waitForTimeout(5000);
  const errors = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('hui-error-card'));
    return nodes.map((node) => {
      const root = node.shadowRoot ?? node;
      const warning = root.querySelector('hui-warning') ?? root;
      return (warning.textContent || '').trim().replace(/\s+/g, ' ');
    });
  });
  if (errors.length) {
    errors.forEach((message, idx) => {
      console.log(`error[${idx + 1}]: ${message}`);
    });
  } else {
    console.log('error[none]');
  }
}

await browser.close();
