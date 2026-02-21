import { mkdir } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const views = [
  { name: 'nexus', path: 'nexus' },
  { name: 'war-room', path: 'war-room' },
  { name: 'command-center', path: 'command-center' },
  { name: 'irrigation', path: 'irrigation' },
  { name: 'energy', path: 'energy' },
  { name: 'security', path: 'security' },
  { name: 'climate', path: 'climate' },
  { name: 'weather', path: 'weather' },
  { name: 'agents', path: 'agents' },
];

const targets = [
  { label: 'desktop', viewport: { width: 1728, height: 1117 } },
  { label: 'mobile', viewport: { width: 430, height: 932 } },
];

const outDir = path.resolve('design-experiments', 'qa-shots');
await mkdir(outDir, { recursive: true });

function loadEnv(pathname = '.env') {
  if (!fs.existsSync(pathname)) return;
  const content = fs.readFileSync(pathname, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const accessToken = process.env.HA_TOKEN;
if (!accessToken) {
  throw new Error('Missing HA_TOKEN in environment/.env');
}

const browser = await chromium.launch({ headless: true });

async function countCards(page) {
  return page.evaluate(() => {
    const deepCount = (root, sel) => {
      let count = 0;
      const walk = (node) => {
        if (!node) return;
        if (node.querySelectorAll) count += node.querySelectorAll(sel).length;
        const all = node.querySelectorAll ? node.querySelectorAll('*') : [];
        for (const el of all) {
          if (el.shadowRoot) walk(el.shadowRoot);
        }
      };
      walk(root);
      return count;
    };
    return deepCount(document, 'ha-card');
  });
}

for (const target of targets) {
  const context = await browser.newContext({ viewport: target.viewport });
  await context.addInitScript((token) => {
    const hassUrl = `${window.location.protocol}//${window.location.host}`;
    const clientId = `${window.location.protocol}//${window.location.host}/`;
    const tokens = {
      access_token: token,
      token_type: 'Bearer',
      expires_in: 315360000,
      expires: Date.now() + 315360000 * 1000,
      hassUrl,
      clientId,
    };
    window.localStorage.setItem('hassTokens', JSON.stringify(tokens));
  }, accessToken);

  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  for (const view of views) {
    const url = `http://localhost:8123/lovelace/${view.path}`;
    let navError = null;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      let cards = 0;
      for (let i = 0; i < 8; i += 1) {
        await page.waitForTimeout(1500);
        cards = await countCards(page);
        if (cards > 3) break;
      }
      if (cards <= 3) {
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(4000);
      }
    } catch (err) {
      navError = err;
    }

    const currentUrl = page.url();
    const isAuth = currentUrl.includes('/auth/') || currentUrl.includes('/login');
    const isError = navError !== null;
    const outputPath = path.join(
      outDir,
      `${view.name}-${target.label}${isAuth ? '-auth' : ''}${isError ? '-error' : ''}.png`
    );

    try {
      await page.screenshot({ path: outputPath, fullPage: true, timeout: 90000 });
    } catch {
      await page.screenshot({ path: outputPath, fullPage: false, timeout: 90000 });
    }
    // eslint-disable-next-line no-console
    console.log(
      `${view.name}:${target.label}:${isAuth ? 'auth' : 'ok'}${isError ? ':error' : ''} -> ${outputPath}`
    );
  }

  await context.close();
}

await browser.close();
