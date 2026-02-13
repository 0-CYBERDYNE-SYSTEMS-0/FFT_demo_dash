#!/usr/bin/env node
/**
 * Full-Scale Farm Telemetry + Agent Activity Simulation
 *
 * Runs continuous telemetry updates and injects realistic agent control actions
 * so Lovelace dashboards show both trends and command activity in real time.
 */

import fs from 'node:fs';
import { createHomeAssistantAdapter, FarmStatus } from '../src/integrations/home-assistant.js';

const MOISTURE_INCREASE_RATE = 0.3;
const MOISTURE_DECREASE_RATE = 0.05;
const TANK_DECREASE_RATE = 50;
const TANK_INCREASE_RATE = 30;
const TEMP_VARIATION = 0.2;
const HUMIDITY_VARIATION = 0.5;
const WIND_VARIATION = 1;
const DEFAULT_TICK_INTERVAL_MS = 15000;
const MIN_TICK_INTERVAL_MS = 1000;
const MAX_TICK_INTERVAL_MS = 300000;

function getTickIntervalMs(): number {
  const raw = process.env.SIM_TICK_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_TICK_INTERVAL_MS;

  const normalized = Math.floor(parsed);
  if (normalized < MIN_TICK_INTERVAL_MS || normalized > MAX_TICK_INTERVAL_MS) {
    return DEFAULT_TICK_INTERVAL_MS;
  }
  return normalized;
}

const SWITCH_ACTION_TARGETS = [
  'switch.irrigation_north',
  'switch.irrigation_south',
  'switch.irrigation_west_pasture',
  'switch.irrigation_east_orchard',
  'switch.irrigation_vegetable',
  'switch.irrigation_nursery',
  'switch.pump_well_1',
  'switch.pump_well_2',
  'switch.pump_main',
  'switch.greenhouse_heater_a',
  'switch.greenhouse_cooling_a',
  'switch.greenhouse_vent_a',
  'switch.security_lights',
  'switch.perimeter_alarm',
] as const;

const BOOLEAN_ACTION_TARGETS = [
  'input_boolean.greenhouse_heater_b',
  'input_boolean.greenhouse_cooling_b',
  'input_boolean.greenhouse_vent_b',
  'input_boolean.greenhouse_heater_c',
  'input_boolean.greenhouse_cooling_c',
  'input_boolean.greenhouse_vent_c',
  'input_boolean.irrigation_drip_main',
  'input_boolean.irrigation_misting_system',
  'input_boolean.automatic_feeder_1',
  'input_boolean.automatic_feeder_2',
] as const;

interface FarmState {
  windSpeed: number;
  windDirection: number;
  barometricPressure: number;
  rainfallToday: number;
  soilMoistureNorth: number;
  soilMoistureSouth: number;
  soilMoistureWest: number;
  soilMoistureEast: number;
  soilMoistureVegetable: number;
  soilMoistureNursery: number;
  greenhouseTempA: number;
  greenhouseTempB: number;
  greenhouseTempC: number;
  greenhouseHumidityA: number;
  greenhouseHumidityB: number;
  greenhouseHumidityC: number;
  tankLevelMain: number;
  tankLevelSecondary: number;
  tankLevelNursery: number;
  well1Level: number;
  well2Level: number;
  pondLevel: number;
  rainwaterCollection: number;
  solarGeneration: number;
  gridConsumption: number;
  batteryLevel: number;
  barnTemp: number;
  barnHumidity: number;
  chickenCoopTemp: number;
}

function loadDotEnv(path = '.env') {
  if (!fs.existsSync(path)) return;
  const content = fs.readFileSync(path, 'utf8');
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

async function getCurrentState(ha: ReturnType<typeof createHomeAssistantAdapter>): Promise<FarmState> {
  const status = await ha.getFarmStatus();
  const states = await ha.getAllStates();

  const getNumberState = (entityId: string, fallback: number): number => {
    const entity = states.find((e) => e.entity_id === entityId);
    const parsed = Number(entity?.state);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return {
    windSpeed: status.windSpeed,
    windDirection: getNumberState('input_number.wind_direction', 180),
    barometricPressure: status.barometricPressure,
    rainfallToday: status.rainfallToday,
    soilMoistureNorth: status.soilMoistureNorth,
    soilMoistureSouth: status.soilMoistureSouth,
    soilMoistureWest: status.soilMoistureWest,
    soilMoistureEast: status.soilMoistureEast,
    soilMoistureVegetable: status.soilMoistureVegetable,
    soilMoistureNursery: status.soilMoistureNursery,
    greenhouseTempA: status.greenhouseTempA,
    greenhouseTempB: status.greenhouseTempB,
    greenhouseTempC: status.greenhouseTempC,
    greenhouseHumidityA: status.greenhouseHumidityA,
    greenhouseHumidityB: status.greenhouseHumidityB,
    greenhouseHumidityC: status.greenhouseHumidityC,
    tankLevelMain: status.waterTankMain,
    tankLevelSecondary: status.waterTankSecondary,
    tankLevelNursery: status.waterTankNursery,
    well1Level: status.well1Level,
    well2Level: status.well2Level,
    pondLevel: status.pondLevel,
    rainwaterCollection: status.rainwaterCollection,
    solarGeneration: status.solarGeneration,
    gridConsumption: status.gridConsumption,
    batteryLevel: status.batteryLevel,
    barnTemp: status.barnTemp,
    barnHumidity: status.barnHumidity,
    chickenCoopTemp: status.barnTemp + 5,
  };
}

async function runAgentActions(ha: ReturnType<typeof createHomeAssistantAdapter>, states: Awaited<ReturnType<ReturnType<typeof createHomeAssistantAdapter>['getAllStates']>>): Promise<void> {
  const getState = (entityId: string): string | undefined => states.find((e) => e.entity_id === entityId)?.state;

  const updates: Array<Promise<unknown>> = [];

  if (Math.random() < 0.35) {
    const target = SWITCH_ACTION_TARGETS[Math.floor(Math.random() * SWITCH_ACTION_TARGETS.length)];
    const currentOn = getState(target) === 'on';
    const nextOn = Math.random() < 0.55 ? !currentOn : currentOn;
    if (nextOn !== currentOn) {
      updates.push(ha.setSwitch(target, nextOn));
      console.log(`[agent] ${target} -> ${nextOn ? 'on' : 'off'}`);
    }
  }

  if (Math.random() < 0.2) {
    const target = BOOLEAN_ACTION_TARGETS[Math.floor(Math.random() * BOOLEAN_ACTION_TARGETS.length)];
    const currentOn = getState(target) === 'on';
    const nextOn = Math.random() < 0.5 ? !currentOn : currentOn;
    if (nextOn !== currentOn) {
      updates.push(ha.setInputBoolean(target, nextOn));
      console.log(`[agent] ${target} -> ${nextOn ? 'on' : 'off'}`);
    }
  }

  if (updates.length) {
    await Promise.allSettled(updates);
  }
}

async function updateState(ha: ReturnType<typeof createHomeAssistantAdapter>, state: FarmState): Promise<void> {
  const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

  state.windSpeed = clamp(state.windSpeed + (Math.random() - 0.5) * WIND_VARIATION * 2, 0, 100);
  state.windDirection = (state.windDirection + (Math.random() - 0.5) * 10 + 360) % 360;
  state.barometricPressure = clamp(state.barometricPressure + (Math.random() - 0.5) * 0.02, 28, 32);

  if (Math.random() < 0.01) {
    state.rainfallToday += 0.1;
    state.rainwaterCollection += Math.random() * 50;
  }

  const states = await ha.getAllStates();
  const getBoolState = (entityId: string): boolean => states.some((e) => e.entity_id === entityId && e.state === 'on');
  const getAnyBoolState = (...entityIds: string[]): boolean => entityIds.some((id) => getBoolState(id));

  const updateMoisture = (current: number, irrigationOn: boolean): number => {
    let newVal = current;
    if (irrigationOn && state.tankLevelMain > 0) {
      newVal += MOISTURE_INCREASE_RATE;
      state.tankLevelMain -= TANK_DECREASE_RATE * 0.5;
    } else {
      newVal -= MOISTURE_DECREASE_RATE;
    }
    return clamp(newVal, 0, 100);
  };

  state.soilMoistureNorth = updateMoisture(state.soilMoistureNorth, getAnyBoolState('switch.irrigation_north', 'input_boolean.irrigation_north', 'input_boolean.irrigation_north_field'));
  state.soilMoistureSouth = updateMoisture(state.soilMoistureSouth, getAnyBoolState('switch.irrigation_south', 'input_boolean.irrigation_south', 'input_boolean.irrigation_south_field'));
  state.soilMoistureWest = updateMoisture(state.soilMoistureWest, getAnyBoolState('switch.irrigation_west_pasture', 'input_boolean.irrigation_west_pasture'));
  state.soilMoistureEast = updateMoisture(state.soilMoistureEast, getAnyBoolState('switch.irrigation_east_orchard', 'input_boolean.irrigation_east_orchard'));
  state.soilMoistureVegetable = updateMoisture(state.soilMoistureVegetable, getAnyBoolState('switch.irrigation_vegetable', 'input_boolean.irrigation_vegetable_field'));
  state.soilMoistureNursery = updateMoisture(state.soilMoistureNursery, getAnyBoolState('switch.irrigation_nursery', 'input_boolean.irrigation_nursery'));

  const updateGreenhouse = (temp: number, humidity: number, heaterOn: boolean, coolingOn: boolean): [number, number] => {
    let newTemp = temp;
    let newHumidity = humidity;

    if (heaterOn && state.tankLevelMain > 0) {
      newTemp += 0.3;
      state.tankLevelMain -= TANK_DECREASE_RATE * 0.2;
    } else {
      newTemp -= TEMP_VARIATION;
    }
    if (coolingOn) newTemp -= 0.4;
    newTemp += (Math.random() - 0.5) * TEMP_VARIATION * 2;
    newHumidity += (Math.random() - 0.5) * HUMIDITY_VARIATION * 2;

    return [clamp(newTemp, 32, 120), clamp(newHumidity, 0, 100)];
  };

  [state.greenhouseTempA, state.greenhouseHumidityA] = updateGreenhouse(
    state.greenhouseTempA,
    state.greenhouseHumidityA,
    getAnyBoolState('switch.greenhouse_heater_a', 'input_boolean.greenhouse_heater_a'),
    getAnyBoolState('switch.greenhouse_cooling_a', 'input_boolean.greenhouse_cooling_a')
  );

  [state.greenhouseTempB, state.greenhouseHumidityB] = updateGreenhouse(
    state.greenhouseTempB,
    state.greenhouseHumidityB,
    getBoolState('input_boolean.greenhouse_heater_b'),
    getBoolState('input_boolean.greenhouse_cooling_b')
  );

  [state.greenhouseTempC, state.greenhouseHumidityC] = updateGreenhouse(
    state.greenhouseTempC,
    state.greenhouseHumidityC,
    getBoolState('input_boolean.greenhouse_heater_c'),
    getBoolState('input_boolean.greenhouse_cooling_c')
  );

  const updateWell = (wellLevel: number, pumpOn: boolean, tankLevel: number): [number, number] => {
    let newWell = wellLevel;
    let newTank = tankLevel;
    if (pumpOn && wellLevel > 0) {
      newWell -= 0.1;
      newTank += TANK_INCREASE_RATE;
    }
    return [clamp(newWell, 0, 100), clamp(newTank, 0, 100000)];
  };

  [state.well1Level, state.tankLevelMain] = updateWell(state.well1Level, getAnyBoolState('switch.pump_well_1', 'input_boolean.pump_well_1'), state.tankLevelMain);
  [state.well2Level, state.tankLevelSecondary] = updateWell(state.well2Level, getAnyBoolState('switch.pump_well_2', 'input_boolean.pump_well_2'), state.tankLevelSecondary);

  const hour = new Date().getHours();
  const solarBase = hour >= 6 && hour <= 18 ? Math.sin((hour - 6) * Math.PI / 12) * 100 : 0;
  state.solarGeneration = clamp(solarBase + (Math.random() - 0.5) * 20, 0, 500);
  state.gridConsumption = clamp(45 + (Math.random() - 0.5) * 8, 10, 120);

  if (state.solarGeneration > state.gridConsumption) {
    state.batteryLevel = clamp(state.batteryLevel + 0.1, 0, 100);
  } else {
    state.batteryLevel = clamp(state.batteryLevel - 0.05, 0, 100);
  }

  state.barnTemp = clamp(state.barnTemp + (Math.random() - 0.5) * TEMP_VARIATION, 32, 80);
  state.barnHumidity = clamp(state.barnHumidity + (Math.random() - 0.5) * 2, 30, 90);
  state.chickenCoopTemp = state.barnTemp + 5;

  const writeResults = await Promise.allSettled([
    ha.setInputNumber('input_number.wind_speed', state.windSpeed),
    ha.setInputNumber('input_number.wind_direction', state.windDirection),
    ha.setInputNumber('input_number.barometric_pressure', state.barometricPressure),
    ha.setInputNumber('input_number.rainfall_today', state.rainfallToday),
    ha.setInputNumber('input_number.soil_moisture_north_field', state.soilMoistureNorth),
    ha.setInputNumber('input_number.soil_moisture_south_field', state.soilMoistureSouth),
    ha.setInputNumber('input_number.soil_moisture_west_pasture', state.soilMoistureWest),
    ha.setInputNumber('input_number.soil_moisture_east_orchard', state.soilMoistureEast),
    ha.setInputNumber('input_number.soil_moisture_vegetable_field', state.soilMoistureVegetable),
    ha.setInputNumber('input_number.soil_moisture_nursery', state.soilMoistureNursery),
    ha.setInputNumber('input_number.greenhouse_temp_section_a', state.greenhouseTempA),
    ha.setInputNumber('input_number.greenhouse_temp_section_b', state.greenhouseTempB),
    ha.setInputNumber('input_number.greenhouse_temp_section_c', state.greenhouseTempC),
    ha.setInputNumber('input_number.greenhouse_humidity_a', state.greenhouseHumidityA),
    ha.setInputNumber('input_number.greenhouse_humidity_b', state.greenhouseHumidityB),
    ha.setInputNumber('input_number.greenhouse_humidity_c', state.greenhouseHumidityC),
    ha.setInputNumber('input_number.tank_level_main', state.tankLevelMain),
    ha.setInputNumber('input_number.tank_level_secondary', state.tankLevelSecondary),
    ha.setInputNumber('input_number.tank_level_nursery', state.tankLevelNursery),
    ha.setInputNumber('input_number.well_1_level', state.well1Level),
    ha.setInputNumber('input_number.well_2_level', state.well2Level),
    ha.setInputNumber('input_number.pond_level', state.pondLevel),
    ha.setInputNumber('input_number.rainwater_collection', state.rainwaterCollection),
    ha.setInputNumber('input_number.solar_generation_kw', state.solarGeneration),
    ha.setInputNumber('input_number.grid_power_consumption', state.gridConsumption),
    ha.setInputNumber('input_number.battery_storage_pct', state.batteryLevel),
    ha.setInputNumber('input_number.barn_temp', state.barnTemp),
    ha.setInputNumber('input_number.barn_humidity', state.barnHumidity),
    ha.setInputNumber('input_number.chicken_coop_temp', state.chickenCoopTemp),
  ]);

  const failures = writeResults.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failures.length > 0) {
    console.warn(`⚠️ Telemetry write partial failure (${failures.length}/${writeResults.length})`);
  }

  await runAgentActions(ha, states);
}

async function runSimulation() {
  loadDotEnv();
  const tickIntervalMs = getTickIntervalMs();

  console.log('🌾 Starting Full-Scale Farm Telemetry + Agent Action Simulation...');
  console.log(`   Tick interval: ${tickIntervalMs}ms`);
  console.log('');

  let ha: ReturnType<typeof createHomeAssistantAdapter>;

  try {
    ha = createHomeAssistantAdapter();
    console.log('✅ Connected to Home Assistant');
  } catch (error) {
    console.error('❌ Failed to connect to Home Assistant:', error);
    process.exit(1);
  }

  let iteration = 0;

  const tick = async () => {
    try {
      const currentState = await getCurrentState(ha);
      await updateState(ha, currentState);

      iteration++;
      if (iteration % 12 === 0) {
        console.log(
          `[${new Date().toISOString()}] Farm Update:`,
          `Temp: ${currentState.greenhouseTempA.toFixed(1)}°F`,
          `Moisture: N:${currentState.soilMoistureNorth.toFixed(1)}% S:${currentState.soilMoistureSouth.toFixed(1)}%`,
          `Water: ${(currentState.tankLevelMain / 1000).toFixed(1)}k gal`,
          `Solar: ${currentState.solarGeneration.toFixed(0)}kW`
        );
      }
    } catch (error) {
      console.error('❌ Simulation tick error:', error);
    }
  };

  setInterval(tick, tickIntervalMs);
  tick();
}

process.on('SIGINT', () => {
  console.log('\n🛑 Stopping farm telemetry simulation...');
  process.exit(0);
});

runSimulation();
