#!/usr/bin/env node
/**
 * NWS Weather Provider
 *
 * Fetches live weather from the National Weather Service API (no key required).
 * Covers US locations only; falls back to synthetic data for non-US coordinates.
 * Caches last successful response; polls every 5 minutes.
 */

export interface LiveWeather {
  tempF: number;
  humidity: number;
  windSpeedMph: number;
  windDirectionDeg: number;
  pressureInHg: number;
  precipLastHourIn: number;
  cloudCoverPct: number;
  condition: string;
  isDaytime: boolean;
  source: 'nws' | 'synthetic';
  fetchedAt: Date;
}

interface NwsPointsResponse {
  properties: {
    observationStations: string;
  };
}

interface NwsStationsResponse {
  features: Array<{ properties: { stationIdentifier: string } }>;
}

interface NwsObservationResponse {
  properties: {
    temperature: { value: number | null; unitCode: string };
    relativeHumidity: { value: number | null };
    windSpeed: { value: number | null };
    windDirection: { value: number | null };
    barometricPressure: { value: number | null };
    precipitationLastHour: { value: number | null };
    cloudLayers: Array<{ amount: string }>;
    textDescription: string;
    timestamp: string;
  };
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const NWS_BASE = 'https://api.weather.gov';
const NWS_UA = 'FFT_demo_dash/1.0 (farmfriend-terminal; contact@example.com)';

interface CacheEntry {
  weather: LiveWeather;
  stationId: string;
  expiresAt: number;
}

const locationCache = new Map<string, CacheEntry>();

function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

async function nwsFetch(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': NWS_UA, Accept: 'application/geo+json' },
  });
  if (!res.ok) throw new Error(`NWS ${res.status}: ${url}`);
  return res.json();
}

function cloudAmountToPct(layers: Array<{ amount: string }>): number {
  if (!layers || layers.length === 0) return 0;
  const topLayer = layers[layers.length - 1];
  const map: Record<string, number> = { CLR: 0, FEW: 15, SCT: 40, BKN: 75, OVC: 100, VV: 100 };
  return map[topLayer.amount] ?? 50;
}

function celsiusToF(c: number): number {
  return c * 1.8 + 32;
}

function mpsToMph(mps: number): number {
  return mps * 2.23694;
}

function paToInHg(pa: number): number {
  return pa * 0.0002953;
}

function mmToIn(mm: number): number {
  return mm * 0.0393701;
}

function syntheticWeather(): LiveWeather {
  const hour = new Date().getHours();
  const isDaytime = hour >= 6 && hour < 20;
  return {
    tempF: 72 + Math.sin((hour / 24) * Math.PI * 2) * 10,
    humidity: 55 + Math.random() * 10,
    windSpeedMph: 5 + Math.random() * 8,
    windDirectionDeg: Math.random() * 360,
    pressureInHg: 29.92 + (Math.random() - 0.5) * 0.3,
    precipLastHourIn: 0,
    cloudCoverPct: 20 + Math.random() * 30,
    condition: 'Clear',
    isDaytime,
    source: 'synthetic',
    fetchedAt: new Date(),
  };
}

async function resolveStation(lat: number, lon: number): Promise<string> {
  const points = (await nwsFetch(`${NWS_BASE}/points/${lat},${lon}`)) as NwsPointsResponse;
  const stationsUrl = points.properties.observationStations;
  const stations = (await nwsFetch(stationsUrl)) as NwsStationsResponse;
  if (!stations.features || stations.features.length === 0) {
    throw new Error('No observation stations found');
  }
  return stations.features[0].properties.stationIdentifier;
}

async function fetchObservation(stationId: string): Promise<LiveWeather> {
  const obs = (await nwsFetch(
    `${NWS_BASE}/stations/${stationId}/observations/latest`
  )) as NwsObservationResponse;
  const p = obs.properties;

  const tempC = p.temperature?.value ?? null;
  const tempF = tempC !== null ? celsiusToF(tempC) : 70;

  const windMps = p.windSpeed?.value ?? 0;
  const windMph = mpsToMph(windMps);

  const pressurePa = p.barometricPressure?.value ?? 101325;
  const pressureInHg = paToInHg(pressurePa);

  const precipMm = p.precipitationLastHour?.value ?? 0;
  const precipIn = precipMm !== null ? mmToIn(precipMm) : 0;

  const cloudLayers = p.cloudLayers ?? [];
  const cloudCoverPct = cloudAmountToPct(cloudLayers);

  const hour = new Date(p.timestamp).getHours();
  const isDaytime = hour >= 6 && hour < 20;

  return {
    tempF,
    humidity: p.relativeHumidity?.value ?? 55,
    windSpeedMph: windMph,
    windDirectionDeg: p.windDirection?.value ?? 180,
    pressureInHg,
    precipLastHourIn: precipIn,
    cloudCoverPct,
    condition: p.textDescription || 'Unknown',
    isDaytime,
    source: 'nws',
    fetchedAt: new Date(),
  };
}

/**
 * Fetch current weather for a lat/lon coordinate.
 * Results are cached for 5 minutes. Falls back to synthetic on any error.
 */
export async function fetchWeather(lat: number, lon: number): Promise<LiveWeather> {
  const key = cacheKey(lat, lon);
  const cached = locationCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.weather;
  }

  try {
    // Reuse cached station ID if we have it
    let stationId = cached?.stationId;
    if (!stationId) {
      stationId = await resolveStation(lat, lon);
    }

    const weather = await fetchObservation(stationId);
    locationCache.set(key, {
      weather,
      stationId,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return weather;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // NWS only covers US; non-US or network errors fall back silently
    if (!msg.includes('404') && !msg.includes('No observation')) {
      console.warn(`[weather-provider] NWS fetch failed (${msg}), using synthetic`);
    } else {
      console.info('[weather-provider] Location outside NWS coverage, using synthetic');
    }
    const fallback = syntheticWeather();
    // Cache briefly so we don't hammer a failing endpoint
    locationCache.set(key, {
      weather: fallback,
      stationId: cached?.stationId ?? '',
      expiresAt: Date.now() + 60_000,
    });
    return fallback;
  }
}

/**
 * Fetch NWS 7-day hourly forecast for a location.
 * Returns array of hourly weather objects for timelapse/replay use.
 */
export async function fetchForecast(
  lat: number,
  lon: number
): Promise<Array<{ time: Date; weather: Partial<LiveWeather> }>> {
  try {
    const points = (await nwsFetch(`${NWS_BASE}/points/${lat},${lon}`)) as {
      properties: { forecastHourly: string };
    };
    const forecastUrl = points.properties.forecastHourly;
    const forecast = (await nwsFetch(forecastUrl)) as {
      properties: {
        periods: Array<{
          startTime: string;
          temperature: number;
          windSpeed: string;
          shortForecast: string;
          isDaytime: boolean;
        }>;
      };
    };

    return forecast.properties.periods.map((p) => {
      const windMph = parseInt(p.windSpeed.split(' ')[0], 10) || 0;
      return {
        time: new Date(p.startTime),
        weather: {
          tempF: p.temperature,
          windSpeedMph: windMph,
          condition: p.shortForecast,
          isDaytime: p.isDaytime,
          cloudCoverPct: p.shortForecast.toLowerCase().includes('cloud') ? 70 : 20,
          source: 'nws' as const,
          fetchedAt: new Date(),
        },
      };
    });
  } catch (err) {
    console.warn('[weather-provider] Forecast fetch failed:', err);
    return [];
  }
}

/**
 * Fetch historical observations for a date (NWS stations API).
 */
export async function fetchHistorical(
  lat: number,
  lon: number,
  date: Date
): Promise<LiveWeather[]> {
  try {
    const key = cacheKey(lat, lon);
    let stationId = locationCache.get(key)?.stationId;
    if (!stationId) {
      stationId = await resolveStation(lat, lon);
    }

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const obs = (await nwsFetch(
      `${NWS_BASE}/stations/${stationId}/observations?start=${start.toISOString()}&end=${end.toISOString()}&limit=24`
    )) as { features: Array<{ properties: NwsObservationResponse['properties'] }> };

    return Promise.all(
      obs.features.map(async (f) => {
        const p = f.properties;
        const tempC = p.temperature?.value ?? null;
        const tempF = tempC !== null ? celsiusToF(tempC) : 70;
        const hour = new Date(p.timestamp).getHours();
        return {
          tempF,
          humidity: p.relativeHumidity?.value ?? 55,
          windSpeedMph: mpsToMph(p.windSpeed?.value ?? 0),
          windDirectionDeg: p.windDirection?.value ?? 180,
          pressureInHg: paToInHg(p.barometricPressure?.value ?? 101325),
          precipLastHourIn: mmToIn(p.precipitationLastHour?.value ?? 0),
          cloudCoverPct: cloudAmountToPct(p.cloudLayers ?? []),
          condition: p.textDescription || 'Unknown',
          isDaytime: hour >= 6 && hour < 20,
          source: 'nws' as const,
          fetchedAt: new Date(p.timestamp),
        };
      })
    );
  } catch (err) {
    console.warn('[weather-provider] Historical fetch failed:', err);
    return [];
  }
}

// CLI usage: npx ts-node scripts/weather-provider.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  const lat = parseFloat(process.env.SIM_LAT ?? '30.08');
  const lon = parseFloat(process.env.SIM_LON ?? '-97.49');
  console.log(`Fetching weather for ${lat}, ${lon}...`);
  fetchWeather(lat, lon).then((w) => {
    console.log(JSON.stringify(w, null, 2));
  });
}
