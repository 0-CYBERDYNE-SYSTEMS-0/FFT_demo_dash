#!/usr/bin/env node
/**
 * Full-Scale Farm Telemetry Simulation
 * 
 * Simulates a comprehensive agricultural operation with:
 * - Multiple field irrigation systems
 * - Greenhouse climate control
 * - Water management
 * - Livestock systems
 * - Equipment tracking
 * - Weather simulation
 * 
 * Usage:
 *   HA_URL=http://localhost:8123 HA_TOKEN=your_token node scripts/simulate-farm-telemetry.ts
 */

import { createHomeAssistantAdapter, FarmStatus } from '../src/integrations/home-assistant.js';
import fs from 'node:fs';

// Simulation rates
const MOISTURE_INCREASE_RATE = 0.3; // % per tick when irrigation ON
const MOISTURE_DECREASE_RATE = 0.05; // % per tick natural evaporation
const TANK_DECREASE_RATE = 50; // gallons per tick when pumping
const TANK_INCREASE_RATE = 30; // gallons per tick when filling
const TEMP_VARIATION = 0.2; // degrees F variation
const HUMIDITY_VARIATION = 0.5; // % variation
const WIND_VARIATION = 1; // mph variation
const TICK_INTERVAL_MS = 5000; // 5 seconds

interface FarmState {
  // Weather
  windSpeed: number;
  windDirection: number;
  barometricPressure: number;
  rainfallToday: number;
  
  // Soil Moisture
  soilMoistureNorth: number;
  soilMoistureSouth: number;
  soilMoistureWest: number;
  soilMoistureEast: number;
  soilMoistureVegetable: number;
  soilMoistureNursery: number;
  
  // Greenhouse
  greenhouseTempA: number;
  greenhouseTempB: number;
  greenhouseTempC: number;
  greenhouseHumidityA: number;
  greenhouseHumidityB: number;
  greenhouseHumidityC: number;
  
  // Water
  tankLevelMain: number;
  tankLevelSecondary: number;
  tankLevelNursery: number;
  well1Level: number;
  well2Level: number;
  pondLevel: number;
  rainwaterCollection: number;
  
  // Power
  solarGeneration: number;
  gridConsumption: number;
  batteryLevel: number;
  
  // Livestock
  barnTemp: number;
  barnHumidity: number;
  chickenCoopTemp: number;
  
  // Irrigation states
  irrigationNorth: boolean;
  irrigationSouth: boolean;
  irrigationWest: boolean;
  irrigationEast: boolean;
  irrigationVegetable: boolean;
  irrigationNursery: boolean;
  
  // Pump states
  pumpWell1: boolean;
  pumpWell2: boolean;
  pumpMain: boolean;
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
    chickenCoopTemp: status.barnTemp + 5, // Slightly warmer
    
    irrigationNorth: false, // Would need to check actual state
    irrigationSouth: false,
    irrigationWest: false,
    irrigationEast: false,
    irrigationVegetable: false,
    irrigationNursery: false,
    
    pumpWell1: false,
    pumpWell2: false,
    pumpMain: false,
  };
}

async function updateState(ha: ReturnType<typeof createHomeAssistantAdapter>, state: FarmState): Promise<void> {
  // Clamp values
  const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));
  
  // Weather updates
  state.windSpeed = clamp(state.windSpeed + (Math.random() - 0.5) * WIND_VARIATION * 2, 0, 100);
  state.windDirection = (state.windDirection + (Math.random() - 0.5) * 10 + 360) % 360;
  state.barometricPressure = clamp(state.barometricPressure + (Math.random() - 0.5) * 0.02, 28, 32);
  
  // Rain chance
  if (Math.random() < 0.01) {
    state.rainfallToday += 0.1;
    state.rainwaterCollection += Math.random() * 50;
  }
  
  // Soil moisture - irrigation effects
  const updateMoisture = async (current: number, irrigationOn: boolean, fieldName: string): Promise<number> => {
    let newVal = current;
    if (irrigationOn && state.tankLevelMain > 0) {
      newVal += MOISTURE_INCREASE_RATE;
      state.tankLevelMain -= TANK_DECREASE_RATE * 0.5;
    } else {
      newVal -= MOISTURE_DECREASE_RATE;
    }
    return clamp(newVal, 0, 100);
  };
  
  // Get irrigation states (simplified - in production would query actual states)
  const states = await ha.getAllStates();
  const getBoolState = (entityId: string): boolean => states.some((e) => e.entity_id === entityId && e.state === 'on');
  const getAnyBoolState = (...entityIds: string[]): boolean => entityIds.some((id) => getBoolState(id));
  
  state.soilMoistureNorth = await updateMoisture(state.soilMoistureNorth, getAnyBoolState('switch.irrigation_north', 'input_boolean.irrigation_north', 'input_boolean.irrigation_north_field'), 'north');
  state.soilMoistureSouth = await updateMoisture(state.soilMoistureSouth, getAnyBoolState('switch.irrigation_south', 'input_boolean.irrigation_south', 'input_boolean.irrigation_south_field'), 'south');
  state.soilMoistureWest = await updateMoisture(state.soilMoistureWest, getAnyBoolState('switch.irrigation_west_pasture', 'input_boolean.irrigation_west_pasture'), 'west');
  state.soilMoistureEast = await updateMoisture(state.soilMoistureEast, getAnyBoolState('switch.irrigation_east_orchard', 'input_boolean.irrigation_east_orchard'), 'east');
  state.soilMoistureVegetable = await updateMoisture(state.soilMoistureVegetable, getAnyBoolState('switch.irrigation_vegetable', 'input_boolean.irrigation_vegetable_field'), 'vegetable');
  state.soilMoistureNursery = await updateMoisture(state.soilMoistureNursery, getAnyBoolState('switch.irrigation_nursery', 'input_boolean.irrigation_nursery'), 'nursery');
  
  // Greenhouse - temperature and humidity simulation
  const updateGreenhouse = (temp: number, humidity: number, heaterOn: boolean, coolingOn: boolean): [number, number] => {
    let newTemp = temp;
    let newHumidity = humidity;
    
    // Temperature
    if (heaterOn && state.tankLevelMain > 0) {
      newTemp += 0.3;
      state.tankLevelMain -= TANK_DECREASE_RATE * 0.2;
    } else {
      newTemp -= TEMP_VARIATION;
    }
    if (coolingOn) {
      newTemp -= 0.4;
    }
    newTemp += (Math.random() - 0.5) * TEMP_VARIATION * 2;
    
    // Humidity
    newHumidity += (Math.random() - 0.5) * HUMIDITY_VARIATION * 2;
    
    return [clamp(newTemp, 32, 120), clamp(newHumidity, 0, 100)];
  };
  
  const getGHBool = (baseEntity: string): boolean => getBoolState(`input_boolean.${baseEntity}`);
  
  [state.greenhouseTempA, state.greenhouseHumidityA] = updateGreenhouse(
    state.greenhouseTempA, state.greenhouseHumidityA,
    getGHBool('greenhouse_heater_a'), getGHBool('greenhouse_cooling_a')
  );
  [state.greenhouseTempB, state.greenhouseHumidityB] = updateGreenhouse(
    state.greenhouseTempB, state.greenhouseHumidityB,
    getGHBool('greenhouse_heater_b'), getGHBool('greenhouse_cooling_b')
  );
  [state.greenhouseTempC, state.greenhouseHumidityC] = updateGreenhouse(
    state.greenhouseTempC, state.greenhouseHumidityC,
    getGHBool('greenhouse_heater_c'), getGHBool('greenhouse_cooling_c')
  );
  
  // Water tank levels - well pumping simulation
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
  
  // Power - solar variation
  const hour = new Date().getHours();
  const solarBase = hour >= 6 && hour <= 18 ? Math.sin((hour - 6) * Math.PI / 12) * 100 : 0;
  state.solarGeneration = clamp(solarBase + (Math.random() - 0.5) * 20, 0, 500);
  
  // Battery charge/discharge
  if (state.solarGeneration > state.gridConsumption) {
    state.batteryLevel = clamp(state.batteryLevel + 0.1, 0, 100);
  } else {
    state.batteryLevel = clamp(state.batteryLevel - 0.05, 0, 100);
  }
  
  // Livestock barn temperature
  state.barnTemp += (Math.random() - 0.5) * TEMP_VARIATION;
  state.barnTemp = clamp(state.barnTemp, 32, 80);
  state.barnHumidity = clamp(state.barnHumidity + (Math.random() - 0.5) * 2, 30, 90);
  state.chickenCoopTemp = state.barnTemp + 5;
  
  // Update all values in parallel
  const writeResults = await Promise.allSettled([
    // Weather
    ha.setInputNumber('input_number.wind_speed', state.windSpeed),
    ha.setInputNumber('input_number.wind_direction', state.windDirection),
    ha.setInputNumber('input_number.barometric_pressure', state.barometricPressure),
    ha.setInputNumber('input_number.rainfall_today', state.rainfallToday),
    
    // Soil Moisture
    ha.setInputNumber('input_number.soil_moisture_north_field', state.soilMoistureNorth),
    ha.setInputNumber('input_number.soil_moisture_south_field', state.soilMoistureSouth),
    ha.setInputNumber('input_number.soil_moisture_west_pasture', state.soilMoistureWest),
    ha.setInputNumber('input_number.soil_moisture_east_orchard', state.soilMoistureEast),
    ha.setInputNumber('input_number.soil_moisture_vegetable_field', state.soilMoistureVegetable),
    ha.setInputNumber('input_number.soil_moisture_nursery', state.soilMoistureNursery),
    
    // Greenhouse
    ha.setInputNumber('input_number.greenhouse_temp_section_a', state.greenhouseTempA),
    ha.setInputNumber('input_number.greenhouse_temp_section_b', state.greenhouseTempB),
    ha.setInputNumber('input_number.greenhouse_temp_section_c', state.greenhouseTempC),
    ha.setInputNumber('input_number.greenhouse_humidity_a', state.greenhouseHumidityA),
    ha.setInputNumber('input_number.greenhouse_humidity_b', state.greenhouseHumidityB),
    ha.setInputNumber('input_number.greenhouse_humidity_c', state.greenhouseHumidityC),
    
    // Water
    ha.setInputNumber('input_number.tank_level_main', state.tankLevelMain),
    ha.setInputNumber('input_number.tank_level_secondary', state.tankLevelSecondary),
    ha.setInputNumber('input_number.tank_level_nursery', state.tankLevelNursery),
    ha.setInputNumber('input_number.well_1_level', state.well1Level),
    ha.setInputNumber('input_number.well_2_level', state.well2Level),
    ha.setInputNumber('input_number.pond_level', state.pondLevel),
    ha.setInputNumber('input_number.rainwater_collection', state.rainwaterCollection),
    
    // Power
    ha.setInputNumber('input_number.solar_generation_kw', state.solarGeneration),
    ha.setInputNumber('input_number.battery_storage_pct', state.batteryLevel),
    
    // Livestock
    ha.setInputNumber('input_number.barn_temp', state.barnTemp),
    ha.setInputNumber('input_number.barn_humidity', state.barnHumidity),
    ha.setInputNumber('input_number.chicken_coop_temp', state.chickenCoopTemp),
  ]);
  const failures = writeResults.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failures.length > 0) {
    console.warn(`⚠️ Telemetry write partial failure (${failures.length}/${writeResults.length})`);
  }
}

async function runSimulation() {
  loadDotEnv();
  console.log('🌾 Starting Full-Scale Farm Telemetry Simulation...');
  console.log(`   Tick interval: ${TICK_INTERVAL_MS}ms`);
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
      if (iteration % 12 === 0) { // Every minute
        console.log(`[${new Date().toISOString()}] Farm Update:`,
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

  // Run simulation loop
  setInterval(tick, TICK_INTERVAL_MS);

  // Initial tick
  tick();
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping farm telemetry simulation...');
  process.exit(0);
});

runSimulation();
