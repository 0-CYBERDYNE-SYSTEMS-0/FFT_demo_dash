#!/usr/bin/env node
/**
 * Mirror Environment
 *
 * Maps live weather from a remote location onto specific farm zone entities.
 * The simulator skips these entities while mirroring is active (MIRROR_GRACE_MS).
 *
 * Usage:
 *   npx ts-node scripts/mirror-environment.ts --location nyc --zone greenhouse_a
 *   npx ts-node scripts/mirror-environment.ts --lat 40.71 --lon -74.01 --zone greenhouse_b
 *   npx ts-node scripts/mirror-environment.ts --location seattle --zone greenhouse_a --loop
 */

import { fetchWeather, LiveWeather } from './weather-provider.js';

const LOCATION_PRESETS: Record<string, { lat: number; lon: number; name: string }> = {
  'cedar-creek':      { lat: 30.08, lon: -97.49, name: 'Cedar Creek TX' },
  'napa-valley':      { lat: 38.50, lon: -122.27, name: 'Napa Valley CA' },
  'midwest-grain':    { lat: 41.88, lon: -87.63, name: 'Illinois Corn Belt' },
  'colorado-hemp':    { lat: 39.74, lon: -105.00, name: 'Denver CO' },
  'florida-citrus':   { lat: 28.54, lon: -81.38, name: 'Orlando FL' },
  'nyc':              { lat: 40.71, lon: -74.01, name: 'NYC' },
  'nyc-greenhouse':   { lat: 40.71, lon: -74.01, name: 'NYC Greenhouse' },
  'seattle':          { lat: 47.61, lon: -122.33, name: 'Seattle WA' },
  'miami':            { lat: 25.76, lon: -80.19, name: 'Miami FL' },
  'denver':           { lat: 39.74, lon: -105.00, name: 'Denver CO' },
  'los-angeles':      { lat: 34.05, lon: -118.24, name: 'Los Angeles CA' },
  'chicago':          { lat: 41.88, lon: -87.63, name: 'Chicago IL' },
  'houston':          { lat: 29.76, lon: -95.37, name: 'Houston TX' },
  'phoenix':          { lat: 33.45, lon: -112.07, name: 'Phoenix AZ' },
};

// Zone -> entity mapping
const ZONE_ENTITIES: Record<string, { temp?: string; humidity?: string }> = {
  greenhouse_a: {
    temp:     'input_number.greenhouse_temp_section_a',
    humidity: 'input_number.greenhouse_humidity_a',
  },
  greenhouse_b: {
    temp:     'input_number.greenhouse_temp_section_b',
    humidity: 'input_number.greenhouse_humidity_b',
  },
  greenhouse_c: {
    temp:     'input_number.greenhouse_temp_section_c',
    humidity: 'input_number.greenhouse_humidity_c',
  },
  outdoor_north: {
    temp:     'input_number.outdoor_temp_north',
    humidity: undefined,
  },
  cannabis: {
    temp:     'input_number.cannabis_site_a_flower_air_temp_f',
    humidity: 'input_number.cannabis_site_a_flower_rh_pct',
  },
};

// Entities that are global (shared across zones)
const GLOBAL_ENTITIES = {
  windSpeed:    'input_number.wind_speed',
  pressure:     'input_number.barometric_pressure',
  rainfall:     'input_number.rainfall_today',
  solar:        'input_number.solar_generation_kw',
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

async function haSet(entityId: string, value: number): Promise<void> {
  const url = `${process.env.HA_URL}/api/services/input_number/set_value`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.HA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ entity_id: entityId, value }),
  });
  if (!res.ok) throw new Error(`HA set ${entityId}: ${res.status}`);
}

async function mirrorWeather(weather: LiveWeather, zone: string, locationName: string): Promise<void> {
  const zoneEntities = ZONE_ENTITIES[zone];
  if (!zoneEntities) {
    throw new Error(`Unknown zone: ${zone}. Valid zones: ${Object.keys(ZONE_ENTITIES).join(', ')}`);
  }

  const hour = new Date().getHours();
  const solarBase = hour >= 6 && hour <= 18 ? Math.sin((hour - 6) * Math.PI / 12) * 100 : 0;
  const cloudFactor = 1 - (weather.cloudCoverPct / 100) * 0.7;
  const solarKw = clamp(solarBase * cloudFactor, 0, 500);

  const writes: Array<Promise<void>> = [];

  // Zone-specific entities (temp attenuated for indoor zones)
  if (zoneEntities.temp) {
    const isIndoor = zone.startsWith('greenhouse') || zone === 'cannabis';
    const tempTarget = isIndoor
      ? clamp(weather.tempF * 0.3 + 65 * 0.7, 55, 92) // indoor buffer
      : weather.tempF;
    writes.push(haSet(zoneEntities.temp, Math.round(tempTarget * 10) / 10));
  }
  if (zoneEntities.humidity) {
    const isIndoor = zone.startsWith('greenhouse') || zone === 'cannabis';
    const humTarget = isIndoor
      ? clamp(weather.humidity * 0.3 + 55 * 0.7, 35, 78)
      : clamp(weather.humidity, 20, 100);
    writes.push(haSet(zoneEntities.humidity, Math.round(humTarget * 10) / 10));
  }

  // Global entities (only update if mirroring outdoor or no zone restriction)
  if (zone === 'outdoor_north' || zone.startsWith('outdoor')) {
    writes.push(haSet(GLOBAL_ENTITIES.windSpeed, Math.round(weather.windSpeedMph * 10) / 10));
    writes.push(haSet(GLOBAL_ENTITIES.pressure, Math.round(weather.pressureInHg * 100) / 100));
    writes.push(haSet(GLOBAL_ENTITIES.rainfall, Math.round(weather.precipLastHourIn * 100) / 100));
    writes.push(haSet(GLOBAL_ENTITIES.solar, Math.round(solarKw * 10) / 10));
  }

  await Promise.allSettled(writes);
  console.log(
    `[mirror] ${locationName} → ${zone}: ${weather.tempF.toFixed(1)}°F, ${weather.humidity.toFixed(0)}% RH, ` +
    `${weather.windSpeedMph.toFixed(1)} mph, ${weather.condition} (${weather.source})`
  );
}

async function loadEnv() {
  const fs = await import('node:fs');
  if (!fs.existsSync('.env')) return;
  const lines = fs.readFileSync('.env', 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}

async function main() {
  await loadEnv();

  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  const has = (flag: string) => args.includes(flag);

  const locationName = get('--location');
  const latArg = get('--lat');
  const lonArg = get('--lon');
  const zone = get('--zone') ?? 'greenhouse_a';
  const loopMode = has('--loop');
  const intervalMs = parseInt(get('--interval') ?? '300000', 10); // 5 min default

  let lat: number;
  let lon: number;
  let label: string;

  if (locationName) {
    const preset = LOCATION_PRESETS[locationName.toLowerCase()];
    if (!preset) {
      console.error(`Unknown location: ${locationName}`);
      console.error(`Available: ${Object.keys(LOCATION_PRESETS).join(', ')}`);
      process.exit(1);
    }
    lat = preset.lat;
    lon = preset.lon;
    label = preset.name;
  } else if (latArg && lonArg) {
    lat = parseFloat(latArg);
    lon = parseFloat(lonArg);
    label = `${lat},${lon}`;
  } else {
    console.error('Usage: mirror-environment.ts --location <name> --zone <zone>');
    console.error('       mirror-environment.ts --lat <lat> --lon <lon> --zone <zone> [--loop]');
    console.error(`Zones: ${Object.keys(ZONE_ENTITIES).join(', ')}`);
    console.error(`Locations: ${Object.keys(LOCATION_PRESETS).join(', ')}`);
    process.exit(1);
  }

  const run = async () => {
    const weather = await fetchWeather(lat, lon);
    await mirrorWeather(weather, zone, label);
  };

  await run();

  if (loopMode) {
    console.log(`[mirror] Looping every ${intervalMs / 1000}s. Ctrl+C to stop.`);
    setInterval(run, intervalMs);
  }
}

main().catch((err) => {
  console.error('[mirror] Fatal:', err);
  process.exit(1);
});
