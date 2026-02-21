import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [
  'ha_config/ui-lovelace-cannabis.yaml',
  'dashboard-templates/views/command-center-cannabis.yaml',
  'dashboard-templates/views/security-cannabis.yaml',
  'dashboard-templates/views/climate-cannabis.yaml',
  'dashboard-templates/views/operations-cannabis.yaml',
].map((f) => path.join(root, f));

const bannedTerms = [
  'livestock',
  'cattle',
  'chicken',
  'barn',
  'grain',
  'silo',
  'eggs',
  'milk',
  'tractor',
  'harvester',
  'orchard',
  'pasture',
  'farm sanctuary',
];

const bannedStrings = [
  'Beta Group Q&A Loop',
  'Raw Unused Channels',
  'illegal operations',
  'type: iframe',
  'hui-error-card',
  'Configuration error',
  '＋',
  '+ only',
];

const hits = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');

  for (const term of bannedTerms) {
    const re = new RegExp(`\\b${term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    lines.forEach((line, i) => {
      if (re.test(line)) {
        hits.push({ file, line: i + 1, needle: term, value: line.trim() });
      }
    });
  }

  for (const needle of bannedStrings) {
    lines.forEach((line, i) => {
      if (line.toLowerCase().includes(needle.toLowerCase())) {
        hits.push({ file, line: i + 1, needle, value: line.trim() });
      }
    });
  }
}

if (hits.length) {
  console.error('FAIL: cannabis taxonomy guard detected blocked terms/strings');
  for (const hit of hits) {
    console.error(`${hit.file}:${hit.line} [${hit.needle}] ${hit.value}`);
  }
  process.exit(1);
}

console.log('PASS: cannabis taxonomy guard passed.');
