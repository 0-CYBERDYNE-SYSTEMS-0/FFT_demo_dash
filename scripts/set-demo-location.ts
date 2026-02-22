#!/usr/bin/env node
/**
 * Set Demo Location
 *
 * Updates the simulator's geographic location for live NWS weather blending.
 * Modifies .env vars in place (does not restart HA).
 *
 * Usage:
 *   npx ts-node scripts/set-demo-location.ts nyc-greenhouse
 *   npx ts-node scripts/set-demo-location.ts --lat 40.7 --lon -74.0 --name "NYC Demo"
 *   npx ts-node scripts/set-demo-location.ts --list
 */

import fs from 'node:fs';

interface LocationPreset {
  lat: number;
  lon: number;
  name: string;
  profile?: string;
  description: string;
}

const PRESETS: Record<string, LocationPreset> = {
  'cedar-creek': {
    lat: 30.08, lon: -97.49,
    name: 'Cedar Creek TX',
    profile: 'mixed',
    description: 'Central TX ranch — default location',
  },
  'napa-valley': {
    lat: 38.50, lon: -122.27,
    name: 'Napa Valley CA',
    profile: 'high_yield',
    description: 'California wine country',
  },
  'midwest-grain': {
    lat: 41.88, lon: -87.63,
    name: 'Illinois Corn Belt',
    profile: 'high_yield',
    description: 'Illinois corn belt operations',
  },
  'colorado-hemp': {
    lat: 39.74, lon: -105.00,
    name: 'Denver CO',
    profile: 'greenhouse',
    description: 'Denver area hemp operations',
  },
  'florida-citrus': {
    lat: 28.54, lon: -81.38,
    name: 'Orlando FL',
    profile: 'high_yield',
    description: 'Florida citrus operations',
  },
  'nyc-greenhouse': {
    lat: 40.71, lon: -74.01,
    name: 'NYC Greenhouse',
    profile: 'greenhouse',
    description: 'NYC urban indoor food farm (greenhouse profile)',
  },
  'seattle': {
    lat: 47.61, lon: -122.33,
    name: 'Seattle WA',
    profile: 'mixed',
    description: 'Pacific Northwest operations',
  },
  'phoenix': {
    lat: 33.45, lon: -112.07,
    name: 'Phoenix AZ',
    profile: 'drought',
    description: 'Desert Southwest — drought conditions',
  },
  'miami': {
    lat: 25.76, lon: -80.19,
    name: 'Miami FL',
    profile: 'greenhouse',
    description: 'South Florida tropical greenhouse',
  },
};

function readEnv(path = '.env'): Map<string, string> {
  const map = new Map<string, string>();
  if (!fs.existsSync(path)) return map;
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    map.set(trimmed.slice(0, idx).trim(), trimmed.slice(idx + 1).trim());
  }
  return map;
}

function writeEnv(map: Map<string, string>, path = '.env'): void {
  const lines: string[] = [];
  // Preserve comments from original file
  if (fs.existsSync(path)) {
    for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        lines.push(line);
        continue;
      }
      const idx = trimmed.indexOf('=');
      if (idx === -1) { lines.push(line); continue; }
      const key = trimmed.slice(0, idx).trim();
      if (map.has(key)) {
        lines.push(`${key}=${map.get(key)}`);
        map.delete(key);
      }
    }
  }
  // Append any new keys
  for (const [key, val] of map) {
    lines.push(`${key}=${val}`);
  }
  fs.writeFileSync(path, lines.join('\n'));
}

function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  if (args.includes('--list') || args.length === 0) {
    console.log('\nAvailable location presets:\n');
    for (const [key, p] of Object.entries(PRESETS)) {
      console.log(`  ${key.padEnd(18)} ${p.lat}, ${p.lon}  (${p.profile})  — ${p.description}`);
    }
    console.log('\nUsage:');
    console.log('  npx ts-node scripts/set-demo-location.ts <preset>');
    console.log('  npx ts-node scripts/set-demo-location.ts --lat <lat> --lon <lon> [--name "Label"] [--profile <profile>]');
    return;
  }

  let lat: number;
  let lon: number;
  let name: string;
  let profile: string;

  const latArg = get('--lat');
  const lonArg = get('--lon');

  if (latArg && lonArg) {
    lat = parseFloat(latArg);
    lon = parseFloat(lonArg);
    name = get('--name') ?? `${lat},${lon}`;
    profile = get('--profile') ?? 'mixed';
  } else {
    const presetKey = args[0];
    const preset = PRESETS[presetKey ?? ''];
    if (!preset) {
      console.error(`Unknown preset: ${presetKey}`);
      console.error(`Run with --list to see available presets.`);
      process.exit(1);
    }
    lat = preset.lat;
    lon = preset.lon;
    name = preset.name;
    profile = preset.profile ?? 'mixed';
  }

  const env = readEnv('.env');
  env.set('SIM_LAT', String(lat));
  env.set('SIM_LON', String(lon));
  env.set('SIM_LIVE_WEATHER', 'true');
  env.set('SIM_FARM_PROFILE', profile);

  writeEnv(env, '.env');

  console.log(`\n✅ Demo location set: ${name}`);
  console.log(`   Coordinates: ${lat}, ${lon}`);
  console.log(`   Profile: ${profile}`);
  console.log(`   Live weather: enabled`);
  console.log(`\nRestart the simulator to apply: npm run simulate:telemetry\n`);
}

main();
