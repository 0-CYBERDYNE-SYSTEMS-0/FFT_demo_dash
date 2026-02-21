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
const PROFILE_SWITCH_EVERY_DEFAULT = 0;

type FarmProfile = 'mixed' | 'drought' | 'storm' | 'greenhouse' | 'high_yield';
type IncidentMode = 'normal' | 'storm' | 'intrusion' | 'power_failure';

interface ProfileBias {
  moistureDrift: number;
  solarMultiplier: number;
  loadBias: number;
  windBias: number;
  rainfallChance: number;
  temperatureBias: number;
  humidityBias: number;
}

const PROFILE_OPTIONS: readonly FarmProfile[] = [
  'mixed',
  'drought',
  'storm',
  'greenhouse',
  'high_yield',
] as const;

const PROFILE_BIASES: Record<FarmProfile, ProfileBias> = {
  mixed: {
    moistureDrift: 0,
    solarMultiplier: 1,
    loadBias: 0,
    windBias: 0,
    rainfallChance: 0.01,
    temperatureBias: 0,
    humidityBias: 0,
  },
  drought: {
    moistureDrift: -0.18,
    solarMultiplier: 1.18,
    loadBias: 6,
    windBias: 1.5,
    rainfallChance: 0.001,
    temperatureBias: 2,
    humidityBias: -4,
  },
  storm: {
    moistureDrift: 0.22,
    solarMultiplier: 0.55,
    loadBias: 10,
    windBias: 7,
    rainfallChance: 0.08,
    temperatureBias: -1.5,
    humidityBias: 7,
  },
  greenhouse: {
    moistureDrift: 0.08,
    solarMultiplier: 0.95,
    loadBias: 12,
    windBias: -1,
    rainfallChance: 0.003,
    temperatureBias: 3,
    humidityBias: 5,
  },
  high_yield: {
    moistureDrift: 0.12,
    solarMultiplier: 1.08,
    loadBias: 4,
    windBias: 0.5,
    rainfallChance: 0.015,
    temperatureBias: 1,
    humidityBias: 2,
  },
};

const TRANSFER_STATUSES = ['Ready', 'Queued', 'In Transit', 'Received', 'Quarantine'] as const;
const CANNABIS_CRITICAL_TASKS = {
  'Normal Production': 'Confirm flowering room setpoint drift',
  'HVAC Saturation': 'Rebalance HVAC stages in indoor flower rooms',
  'Fertigation Drift': 'Retune fertigation EC and pH dosing profile',
  'Security Intrusion': 'Lock perimeter and validate vault chain-of-custody',
  'Utility Outage': 'Stabilize backup generation and HVAC priorities',
  'Compliance Drift': 'Close QA holds and reconcile transfer records',
  'Logistics Disruption': 'Reroute transfer queue and dispatch timing',
} as const;

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function createTag(prefix: string): string {
  const date = new Date();
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const serial = Math.floor(1000 + Math.random() * 8999);
  return `${prefix}-${yy}${mm}${dd}-${serial}`;
}

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

function getProfileSwitchEveryTicks(): number {
  const raw = process.env.SIM_PROFILE_SWITCH_EVERY;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return PROFILE_SWITCH_EVERY_DEFAULT;
  const normalized = Math.floor(parsed);
  if (normalized < 0 || normalized > 10000) return PROFILE_SWITCH_EVERY_DEFAULT;
  return normalized;
}

function normalizeProfile(rawProfile: string | undefined): FarmProfile {
  if (!rawProfile) return 'mixed';
  const normalized = rawProfile.toLowerCase().trim().replace(/[-\s]+/g, '_');
  return PROFILE_OPTIONS.includes(normalized as FarmProfile)
    ? (normalized as FarmProfile)
    : 'mixed';
}

function pickNextProfile(current: FarmProfile): FarmProfile {
  const alternatives = PROFILE_OPTIONS.filter((profile) => profile !== current);
  return alternatives[Math.floor(Math.random() * alternatives.length)] || 'mixed';
}

function normalizeIncidentMode(rawMode: string | undefined): IncidentMode {
  if (!rawMode) return 'normal';
  const normalized = rawMode.toLowerCase().trim().replace(/[-\s]+/g, '_');
  switch (normalized) {
    case 'storm':
      return 'storm';
    case 'intrusion':
      return 'intrusion';
    case 'power_failure':
      return 'power_failure';
    default:
      return 'normal';
  }
}

function profileForIncident(mode: IncidentMode, fallback: FarmProfile): FarmProfile {
  switch (mode) {
    case 'storm':
      return 'storm';
    case 'intrusion':
      return 'drought';
    case 'power_failure':
      return 'greenhouse';
    default:
      return fallback;
  }
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
  'switch.backup_generator',
  'switch.frost_protection',
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
  'input_boolean.backup_generator',
  'input_boolean.motion_sensor_barn',
  'input_boolean.motion_sensor_equipment',
  'input_boolean.outdoor_flood_lights',
  'input_boolean.perimeter_alarm',
  'input_boolean.security_lights_perimeter',
  'input_boolean.pump_well_1',
  'input_boolean.pump_well_2',
  'input_boolean.irrigation_north_field',
  'input_boolean.irrigation_south_field',
  'input_boolean.irrigation_grain_silo_a',
  'input_boolean.irrigation_grain_silo_b',
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
  generatorFuel: number;
  tractorFuel: number;
  harvesterFuel: number;
  truckFuel1: number;
  truckFuel2: number;
  barnTemp: number;
  barnHumidity: number;
  chickenCoopTemp: number;
  grainYield: number;
  vegetableYield: number;
  fruitYield: number;
  eggsToday: number;
  milkToday: number;
  feedSiloLevel: number;
  soilPhNorth: number;
  soilPhSouth: number;
  soilPhOrchard: number;
  soilPhVegetable: number;
  nitrogenNorth: number;
  nitrogenSouth: number;
  phosphorus: number;
  potassium: number;
  waterPhMain: number;
  waterPhNursery: number;
  transferQueueCount: number;
  auditCompletenessPct: number;
  qaReleaseReadiness: number;
  metrcSyncHealth: number;
  custodyBreakRisk: number;
  qaHoldActive: boolean;
  recallReadiness: boolean;
  transferStatus: string;
  lastManifestId: string;
  lastPackageTag: string;
  lastPlantBatchTag: string;
  lastCoaId: string;
  cannabisAirTempF: number;
  cannabisLeafTempF: number;
  cannabisRhPct: number;
  cannabisCo2Ppm: number;
  cannabisPpfd: number;
  cannabisDli: number;
  cannabisHvacLoadPct: number;
  cannabisDehuLoadPct: number;
  cannabisZoneACycles: number;
  cannabisZoneBCycles: number;
  cannabisEcIn: number;
  cannabisPhIn: number;
  cannabisDoseRateMlMin: number;
  cannabisRunoffEc: number;
  cannabisRunoffPh: number;
  cannabisReclaimQualityIdx: number;
  cannabisDryRoomTempF: number;
  cannabisDryRoomRhPct: number;
  cannabisCureProgressPct: number;
  cannabisMoistureContentPct: number;
  cannabisExtractionQueueCount: number;
  cannabisPackagingThroughputUnitsHr: number;
  cannabisLineUptimePct: number;
  cannabisQcHoldCount: number;
  cannabisAccessDeniedEvents1h: number;
  cannabisGuardCoveragePct: number;
  cannabisStaffOnShiftTotal: number;
  cannabisStaffCultivation: number;
  cannabisStaffProcessing: number;
  cannabisStaffSecurity: number;
  cannabisStaffLogistics: number;
  cannabisWorkOrdersOpen: number;
  cannabisWorkOrdersOverdue: number;
  cannabisScheduleAdherencePct: number;
  cannabisCameraHealthPct: number;
  cannabisCameraAlertCount: number;
  cannabisDroneProgressPct: number;
  cannabisDroneBatteryPct: number;
  cannabisDroneAnomalyScore: number;
  cannabisTransferEtaMin: number;
  cannabisTransportRiskIdx: number;
  cannabisTotalDriedFlowerLbs: number;
  cannabisTotalExtractLiters: number;
  cannabisTotalPackagedUnits: number;
  cannabisZoneVegIrrigation: boolean;
  cannabisZoneFlowerIrrigation: boolean;
  cannabisGreenhouseIrrigation: boolean;
  cannabisHempBlockIrrigation: boolean;
  cannabisHvacEnable: boolean;
  cannabisDehuEnable: boolean;
  cannabisCo2InjectEnable: boolean;
  cannabisFertigationEnable: boolean;
  cannabisProcessingLineEnable: boolean;
  cannabisPackagingLineEnable: boolean;
  cannabisPerimeterLockdown: boolean;
  cannabisVaultLock: boolean;
  cannabisCameraPtzPatrol: boolean;
  cannabisVaultExceptionActive: boolean;
  cannabisBadgeSystemDegraded: boolean;
  cannabisStaffShortageAlert: boolean;
  cannabisScheduleDisruptionActive: boolean;
  cannabisDroneGeofenceBreach: boolean;
  cannabisCameraLinkDegraded: boolean;
  cannabisProcessingLineFault: boolean;
  cannabisHvacAlarm: boolean;
  cannabisDehuAlarm: boolean;
  cannabisFertigationAlarm: boolean;
  cannabisTransportDelay: boolean;
  cannabisSecurityIntrusion: boolean;
  cannabisShiftMode: string;
  cannabisSiteFocus: string;
  cannabisSecurityPosture: string;
  cannabisDroneMissionState: string;
  cannabisScenario: string;
  cannabisEnvRecipe: string;
  cannabisControlProfile: string;
  cannabisShiftSupervisor: string;
  cannabisNextCriticalTask: string;
  cannabisDispatchChannelStatus: string;
  cannabisBrowserOpsPrimaryUrl: string;
  cannabisBrowserOpsSecondaryUrl: string;
  cannabisManifestLiveId: string;

  // Grow room tracking
  cannabisRoomAStage: string;
  cannabisRoomBStage: string;
  cannabisRoomCStage: string;
  cannabisRoomDStage: string;
  cannabisRoomADaysInStage: number;
  cannabisRoomBDaysInStage: number;
  cannabisRoomCDaysInStage: number;
  cannabisRoomDDaysInStage: number;
  cannabisRoomAPlantCount: number;
  cannabisRoomBPlantCount: number;
  cannabisRoomCPlantCount: number;
  cannabisRoomDPlantCount: number;
  cannabisRoomAExpectedYieldLbs: number;
  cannabisRoomBExpectedYieldLbs: number;
  cannabisRoomCExpectedYieldLbs: number;
  cannabisRoomDExpectedYieldLbs: number;

  // IPM
  cannabisIpmPestPressureRoomA: number;
  cannabisIpmPestPressureRoomB: number;
  cannabisIpmPestPressureRoomC: number;
  cannabisIpmPestPressureRoomD: number;
  cannabisIpmDaysSinceSprayRoomA: number;
  cannabisIpmDaysSinceSprayRoomB: number;
  cannabisIpmDaysSinceSprayRoomC: number;
  cannabisIpmDaysSinceSprayRoomD: number;
  cannabisIpmScoutingDueRoomA: boolean;
  cannabisIpmScoutingDueRoomB: boolean;
  cannabisIpmScoutingDueRoomC: boolean;
  cannabisIpmScoutingDueRoomD: boolean;
  cannabisIpmZoneAQuarantine: boolean;
  cannabisIpmZoneBQuarantine: boolean;
  cannabisIpmZoneCQuarantine: boolean;
  cannabisIpmZoneDQuarantine: boolean;

  // Extraction lab
  cannabisLabExtractionActive: boolean;
  cannabisLabSafetyInterlockOk: boolean;
  cannabisLabPpeComplianceActive: boolean;
  cannabisLabSolventAlarm: boolean;
  cannabisLabBatchQueueCount: number;
  cannabisLabExtractionYieldPct: number;
  cannabisLabSolventRecoveryPct: number;
  cannabisLabActiveBatchDurationHrs: number;
  cannabisLabRoomTempF: number;
  cannabisLabRoomRhPct: number;
  cannabisLabVentilationPct: number;
  cannabisLabWeeklyThroughputLbsBiomass: number;
  cannabisLabCrudeOilLbs: number;
  cannabisLabDistillateLiters: number;
  cannabisLabIsolateKg: number;
  cannabisLabRosinGrams: number;

  // Dispensary
  cannabisDispensaryDailySalesUsd: number;
  cannabisDispensaryTransactionCount: number;
  cannabisDispensaryAvgBasketUsd: number;
  cannabisDispensaryPatientCountToday: number;
  cannabisDispensaryStaffFloor: number;
  cannabisDispensaryComplianceHolds: number;
  cannabisDispensaryFlowerInventoryGrams: number;
  cannabisDispensaryExtractInventoryGrams: number;
  cannabisDispensaryEdiblesInventoryUnits: number;
  cannabisDispensaryPrerollInventoryUnits: number;
  cannabisDispensaryPosOnline: boolean;
  cannabisDispensaryMetrcPosSyncOk: boolean;
  cannabisDispensaryLowInventoryAlert: boolean;

  // Financial
  cannabisFinancialCostPerGramFlower: number;
  cannabisFinancialCostPerPoundBiomass: number;
  cannabisFinancialLaborCostToday: number;
  cannabisFinancialEnergyCostToday: number;
  cannabisFinancialBatchRevenueUsd: number;
  cannabisFinancialGrossMarginPct: number;

  // Compliance extension
  cannabisLicenseDaysRemaining: number;
  cannabisDestructionEventCount: number;
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

  const getStringState = (entityId: string, fallback: string): string => {
    const entity = states.find((e) => e.entity_id === entityId);
    return entity?.state?.trim() || fallback;
  };

  const getBooleanState = (entityId: string, fallback = false): boolean => {
    const entity = states.find((e) => e.entity_id === entityId);
    if (!entity) return fallback;
    return entity.state === 'on';
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
    generatorFuel: status.generatorFuel,
    tractorFuel: status.tractorFuel,
    harvesterFuel: status.harvesterFuel,
    truckFuel1: status.truck1Fuel,
    truckFuel2: status.truck2Fuel,
    barnTemp: status.barnTemp,
    barnHumidity: status.barnHumidity,
    chickenCoopTemp: status.barnTemp + 5,
    grainYield: status.grainYield,
    vegetableYield: status.vegetableYield,
    fruitYield: status.fruitYield,
    eggsToday: status.eggsToday,
    milkToday: status.milkToday,
    feedSiloLevel: status.feedSiloLevel,
    soilPhNorth: getNumberState('input_number.soil_ph_north', 6.4),
    soilPhSouth: getNumberState('input_number.soil_ph_south', 6.3),
    soilPhOrchard: getNumberState('input_number.soil_ph_orchard', 6.6),
    soilPhVegetable: getNumberState('input_number.soil_ph_vegetable', 6.5),
    nitrogenNorth: getNumberState('input_number.nitrogen_level_north', 58),
    nitrogenSouth: getNumberState('input_number.nitrogen_level_south', 54),
    phosphorus: getNumberState('input_number.phosphorus_level', 46),
    potassium: getNumberState('input_number.potassium_level', 52),
    waterPhMain: getNumberState('input_number.water_ph_main', 7),
    waterPhNursery: getNumberState('input_number.water_ph_nursery', 6.8),
    transferQueueCount: getNumberState('input_number.transfer_queue_count', 2),
    auditCompletenessPct: getNumberState('input_number.audit_completeness_pct', 93),
    qaReleaseReadiness: getNumberState('input_number.qa_release_readiness', 88),
    metrcSyncHealth: getNumberState('input_number.metrc_sync_health', 95),
    custodyBreakRisk: getNumberState('input_number.custody_break_risk', 6),
    qaHoldActive: getBooleanState('input_boolean.qa_hold_active'),
    recallReadiness: getBooleanState('input_boolean.recall_readiness'),
    transferStatus: getStringState('input_select.transfer_status', 'Ready'),
    lastManifestId: getStringState('input_text.metrc_manifest_id', 'MANIFEST-2402-0001'),
    lastPackageTag: getStringState('input_text.metrc_last_package_tag', 'PKG-2402-0001'),
    lastPlantBatchTag: getStringState('input_text.metrc_last_plant_batch_tag', 'PLANT-2402-0001'),
    lastCoaId: getStringState('input_text.metrc_last_coa_id', 'COA-2402-0001'),
    cannabisAirTempF: status.env.air_temp_f,
    cannabisLeafTempF: status.env.leaf_temp_f,
    cannabisRhPct: status.env.rh_pct,
    cannabisCo2Ppm: status.env.co2_ppm,
    cannabisPpfd: status.env.ppfd,
    cannabisDli: status.env.dli,
    cannabisHvacLoadPct: status.env.hvac_load_pct,
    cannabisDehuLoadPct: status.env.dehu_load_pct,
    cannabisZoneACycles: getNumberState('input_number.cannabis_irrigation_zone_a_cycles', 18),
    cannabisZoneBCycles: getNumberState('input_number.cannabis_irrigation_zone_b_cycles', 15),
    cannabisEcIn: status.irrigation_fertigation.ec_in,
    cannabisPhIn: status.irrigation_fertigation.ph_in,
    cannabisDoseRateMlMin: status.irrigation_fertigation.dose_rate_ml_min,
    cannabisRunoffEc: status.irrigation_fertigation.runoff_ec,
    cannabisRunoffPh: status.irrigation_fertigation.runoff_ph,
    cannabisReclaimQualityIdx: status.irrigation_fertigation.reclaim_quality_idx,
    cannabisDryRoomTempF: status.post_harvest.dry_room_temp_f,
    cannabisDryRoomRhPct: status.post_harvest.dry_room_rh_pct,
    cannabisCureProgressPct: status.post_harvest.cure_progress_pct,
    cannabisMoistureContentPct: status.post_harvest.moisture_content_pct,
    cannabisExtractionQueueCount: status.processing_packaging.extraction_queue_count,
    cannabisPackagingThroughputUnitsHr: status.processing_packaging.packaging_throughput_units_hr,
    cannabisLineUptimePct: status.processing_packaging.line_uptime_pct,
    cannabisQcHoldCount: status.processing_packaging.qc_hold_count,
    cannabisAccessDeniedEvents1h: status.security_access.access_denied_events_1h,
    cannabisGuardCoveragePct: status.security_access.guard_coverage_pct,
    cannabisStaffOnShiftTotal: status.workforce_schedule.staff_on_shift_total,
    cannabisStaffCultivation: status.workforce_schedule.staff_by_function.cultivation,
    cannabisStaffProcessing: status.workforce_schedule.staff_by_function.processing,
    cannabisStaffSecurity: status.workforce_schedule.staff_by_function.security,
    cannabisStaffLogistics: status.workforce_schedule.staff_by_function.logistics,
    cannabisWorkOrdersOpen: status.workforce_schedule.work_orders_open,
    cannabisWorkOrdersOverdue: status.workforce_schedule.work_orders_overdue,
    cannabisScheduleAdherencePct: status.workforce_schedule.schedule_adherence_pct,
    cannabisCameraHealthPct: status.video_drone.camera_health_pct,
    cannabisCameraAlertCount: status.video_drone.camera_alert_count,
    cannabisDroneProgressPct: status.video_drone.drone_progress_pct,
    cannabisDroneBatteryPct: status.video_drone.drone_battery_pct,
    cannabisDroneAnomalyScore: status.video_drone.drone_anomaly_score,
    cannabisTransferEtaMin: getNumberState('input_number.cannabis_transfer_eta_min', 85),
    cannabisTransportRiskIdx: getNumberState('input_number.cannabis_transport_risk_idx', 18),
    cannabisTotalDriedFlowerLbs: getNumberState('input_number.cannabis_total_dried_flower_lbs', 28340),
    cannabisTotalExtractLiters: getNumberState('input_number.cannabis_total_extract_liters', 3720),
    cannabisTotalPackagedUnits: getNumberState('input_number.cannabis_total_packaged_units', 246500),
    cannabisZoneVegIrrigation: getBooleanState('input_boolean.cannabis_site_a_zone_veg_irrigation'),
    cannabisZoneFlowerIrrigation: getBooleanState('input_boolean.cannabis_site_a_zone_flower_irrigation'),
    cannabisGreenhouseIrrigation: getBooleanState('input_boolean.cannabis_site_b_greenhouse_irrigation'),
    cannabisHempBlockIrrigation: getBooleanState('input_boolean.cannabis_site_c_hemp_block_irrigation'),
    cannabisHvacEnable: getBooleanState('input_boolean.cannabis_site_a_hvac_enable', true),
    cannabisDehuEnable: getBooleanState('input_boolean.cannabis_site_a_dehu_enable', true),
    cannabisCo2InjectEnable: getBooleanState('input_boolean.cannabis_site_a_co2_inject_enable', true),
    cannabisFertigationEnable: getBooleanState('input_boolean.cannabis_site_a_fertigation_enable', true),
    cannabisProcessingLineEnable: getBooleanState('input_boolean.cannabis_site_a_processing_line_enable', true),
    cannabisPackagingLineEnable: getBooleanState('input_boolean.cannabis_site_a_packaging_line_enable', true),
    cannabisPerimeterLockdown: getBooleanState('input_boolean.cannabis_site_a_perimeter_lockdown'),
    cannabisVaultLock: getBooleanState('input_boolean.cannabis_site_a_vault_lock', true),
    cannabisCameraPtzPatrol: getBooleanState('input_boolean.cannabis_site_a_camera_ptz_patrol', true),
    cannabisVaultExceptionActive: getBooleanState('input_boolean.cannabis_vault_exception_active'),
    cannabisBadgeSystemDegraded: getBooleanState('input_boolean.cannabis_badge_system_degraded'),
    cannabisStaffShortageAlert: getBooleanState('input_boolean.cannabis_staff_shortage_alert'),
    cannabisScheduleDisruptionActive: getBooleanState('input_boolean.cannabis_schedule_disruption_active'),
    cannabisDroneGeofenceBreach: getBooleanState('input_boolean.cannabis_drone_geofence_breach'),
    cannabisCameraLinkDegraded: getBooleanState('input_boolean.cannabis_camera_link_degraded'),
    cannabisProcessingLineFault: getBooleanState('input_boolean.cannabis_processing_line_fault'),
    cannabisHvacAlarm: getBooleanState('input_boolean.cannabis_hvac_alarm'),
    cannabisDehuAlarm: getBooleanState('input_boolean.cannabis_dehu_alarm'),
    cannabisFertigationAlarm: getBooleanState('input_boolean.cannabis_fertigation_alarm'),
    cannabisTransportDelay: getBooleanState('input_boolean.cannabis_transport_delay'),
    cannabisSecurityIntrusion: getBooleanState('input_boolean.cannabis_security_intrusion'),
    cannabisShiftMode: getStringState('input_select.cannabis_shift_mode', 'Day'),
    cannabisSiteFocus: getStringState('input_select.cannabis_site_focus', 'Site A Indoor'),
    cannabisSecurityPosture: getStringState('input_select.cannabis_security_posture', 'Normal'),
    cannabisDroneMissionState: getStringState('input_select.cannabis_drone_mission_state', 'Idle'),
    cannabisScenario: getStringState('input_select.cannabis_scenario', 'Normal Production'),
    cannabisEnvRecipe: getStringState('input_select.cannabis_env_recipe', 'Flower'),
    cannabisControlProfile: getStringState('input_select.cannabis_control_profile', 'Balanced'),
    cannabisShiftSupervisor: getStringState('input_text.cannabis_shift_supervisor', 'Ops Lead'),
    cannabisNextCriticalTask: getStringState('input_text.cannabis_next_critical_task', 'Review operations board'),
    cannabisDispatchChannelStatus: getStringState('input_text.cannabis_dispatch_channel_status', 'CLEAR'),
    cannabisBrowserOpsPrimaryUrl: getStringState('input_text.cannabis_browser_ops_primary_url', 'https://radar.weather.gov/'),
    cannabisBrowserOpsSecondaryUrl: getStringState('input_text.cannabis_browser_ops_secondary_url', 'https://www.ospo.noaa.gov/Products/imagery/goes.html'),
    cannabisManifestLiveId: getStringState('input_text.cannabis_manifest_live_id', 'CAN-MAN-2402-0001'),

    // Grow room tracking
    cannabisRoomAStage: getStringState('input_select.cannabis_room_a_stage', 'Flower Wk4'),
    cannabisRoomBStage: getStringState('input_select.cannabis_room_b_stage', 'Flower Wk7'),
    cannabisRoomCStage: getStringState('input_select.cannabis_room_c_stage', 'Flush'),
    cannabisRoomDStage: getStringState('input_select.cannabis_room_d_stage', 'Veg'),
    cannabisRoomADaysInStage: getNumberState('input_number.cannabis_room_a_days_in_stage', 26),
    cannabisRoomBDaysInStage: getNumberState('input_number.cannabis_room_b_days_in_stage', 47),
    cannabisRoomCDaysInStage: getNumberState('input_number.cannabis_room_c_days_in_stage', 6),
    cannabisRoomDDaysInStage: getNumberState('input_number.cannabis_room_d_days_in_stage', 18),
    cannabisRoomAPlantCount: getNumberState('input_number.cannabis_room_a_plant_count', 120),
    cannabisRoomBPlantCount: getNumberState('input_number.cannabis_room_b_plant_count', 108),
    cannabisRoomCPlantCount: getNumberState('input_number.cannabis_room_c_plant_count', 115),
    cannabisRoomDPlantCount: getNumberState('input_number.cannabis_room_d_plant_count', 130),
    cannabisRoomAExpectedYieldLbs: getNumberState('input_number.cannabis_room_a_expected_yield_lbs', 18.5),
    cannabisRoomBExpectedYieldLbs: getNumberState('input_number.cannabis_room_b_expected_yield_lbs', 16.2),
    cannabisRoomCExpectedYieldLbs: getNumberState('input_number.cannabis_room_c_expected_yield_lbs', 17.8),
    cannabisRoomDExpectedYieldLbs: getNumberState('input_number.cannabis_room_d_expected_yield_lbs', 21.0),

    // IPM
    cannabisIpmPestPressureRoomA: getNumberState('input_number.cannabis_ipm_pest_pressure_room_a', 1.8),
    cannabisIpmPestPressureRoomB: getNumberState('input_number.cannabis_ipm_pest_pressure_room_b', 3.2),
    cannabisIpmPestPressureRoomC: getNumberState('input_number.cannabis_ipm_pest_pressure_room_c', 0.9),
    cannabisIpmPestPressureRoomD: getNumberState('input_number.cannabis_ipm_pest_pressure_room_d', 2.1),
    cannabisIpmDaysSinceSprayRoomA: getNumberState('input_number.cannabis_ipm_days_since_spray_room_a', 8),
    cannabisIpmDaysSinceSprayRoomB: getNumberState('input_number.cannabis_ipm_days_since_spray_room_b', 3),
    cannabisIpmDaysSinceSprayRoomC: getNumberState('input_number.cannabis_ipm_days_since_spray_room_c', 12),
    cannabisIpmDaysSinceSprayRoomD: getNumberState('input_number.cannabis_ipm_days_since_spray_room_d', 5),
    cannabisIpmScoutingDueRoomA: getBooleanState('input_boolean.cannabis_ipm_scouting_due_room_a'),
    cannabisIpmScoutingDueRoomB: getBooleanState('input_boolean.cannabis_ipm_scouting_due_room_b'),
    cannabisIpmScoutingDueRoomC: getBooleanState('input_boolean.cannabis_ipm_scouting_due_room_c'),
    cannabisIpmScoutingDueRoomD: getBooleanState('input_boolean.cannabis_ipm_scouting_due_room_d'),
    cannabisIpmZoneAQuarantine: getBooleanState('input_boolean.cannabis_ipm_zone_a_quarantine'),
    cannabisIpmZoneBQuarantine: getBooleanState('input_boolean.cannabis_ipm_zone_b_quarantine'),
    cannabisIpmZoneCQuarantine: getBooleanState('input_boolean.cannabis_ipm_zone_c_quarantine'),
    cannabisIpmZoneDQuarantine: getBooleanState('input_boolean.cannabis_ipm_zone_d_quarantine'),

    // Extraction lab
    cannabisLabExtractionActive: getBooleanState('input_boolean.cannabis_lab_extraction_active'),
    cannabisLabSafetyInterlockOk: getBooleanState('input_boolean.cannabis_lab_safety_interlock_ok'),
    cannabisLabPpeComplianceActive: getBooleanState('input_boolean.cannabis_lab_ppe_compliance_active'),
    cannabisLabSolventAlarm: getBooleanState('input_boolean.cannabis_lab_solvent_alarm'),
    cannabisLabBatchQueueCount: getNumberState('input_number.cannabis_lab_batch_queue_count', 3),
    cannabisLabExtractionYieldPct: getNumberState('input_number.cannabis_lab_extraction_yield_pct', 78.5),
    cannabisLabSolventRecoveryPct: getNumberState('input_number.cannabis_lab_solvent_recovery_pct', 88.2),
    cannabisLabActiveBatchDurationHrs: getNumberState('input_number.cannabis_lab_active_batch_duration_hrs', 4.5),
    cannabisLabRoomTempF: getNumberState('input_number.cannabis_lab_room_temp_f', 68.0),
    cannabisLabRoomRhPct: getNumberState('input_number.cannabis_lab_room_rh_pct', 42.0),
    cannabisLabVentilationPct: getNumberState('input_number.cannabis_lab_ventilation_pct', 85),
    cannabisLabWeeklyThroughputLbsBiomass: getNumberState('input_number.cannabis_lab_weekly_throughput_lbs_biomass', 120),
    cannabisLabCrudeOilLbs: getNumberState('input_number.cannabis_lab_crude_oil_lbs', 12.4),
    cannabisLabDistillateLiters: getNumberState('input_number.cannabis_lab_distillate_liters', 8.2),
    cannabisLabIsolateKg: getNumberState('input_number.cannabis_lab_isolate_kg', 1.85),
    cannabisLabRosinGrams: getNumberState('input_number.cannabis_lab_rosin_grams', 340),

    // Dispensary
    cannabisDispensaryDailySalesUsd: getNumberState('input_number.cannabis_dispensary_daily_sales_usd', 8420),
    cannabisDispensaryTransactionCount: getNumberState('input_number.cannabis_dispensary_transaction_count', 84),
    cannabisDispensaryAvgBasketUsd: getNumberState('input_number.cannabis_dispensary_avg_basket_usd', 100.24),
    cannabisDispensaryPatientCountToday: getNumberState('input_number.cannabis_dispensary_patient_count_today', 78),
    cannabisDispensaryStaffFloor: getNumberState('input_number.cannabis_dispensary_staff_floor', 4),
    cannabisDispensaryComplianceHolds: getNumberState('input_number.cannabis_dispensary_compliance_holds', 0),
    cannabisDispensaryFlowerInventoryGrams: getNumberState('input_number.cannabis_dispensary_flower_inventory_grams', 1840),
    cannabisDispensaryExtractInventoryGrams: getNumberState('input_number.cannabis_dispensary_extract_inventory_grams', 620),
    cannabisDispensaryEdiblesInventoryUnits: getNumberState('input_number.cannabis_dispensary_edibles_inventory_units', 145),
    cannabisDispensaryPrerollInventoryUnits: getNumberState('input_number.cannabis_dispensary_preroll_inventory_units', 88),
    cannabisDispensaryPosOnline: getBooleanState('input_boolean.cannabis_dispensary_pos_online'),
    cannabisDispensaryMetrcPosSyncOk: getBooleanState('input_boolean.cannabis_dispensary_metrc_pos_sync_ok'),
    cannabisDispensaryLowInventoryAlert: getBooleanState('input_boolean.cannabis_dispensary_low_inventory_alert'),

    // Financial
    cannabisFinancialCostPerGramFlower: getNumberState('input_number.cannabis_financial_cost_per_gram_flower', 1.42),
    cannabisFinancialCostPerPoundBiomass: getNumberState('input_number.cannabis_financial_cost_per_pound_biomass', 85),
    cannabisFinancialLaborCostToday: getNumberState('input_number.cannabis_financial_labor_cost_today', 2840),
    cannabisFinancialEnergyCostToday: getNumberState('input_number.cannabis_financial_energy_cost_today', 1120),
    cannabisFinancialBatchRevenueUsd: getNumberState('input_number.cannabis_financial_batch_revenue_usd', 42000),
    cannabisFinancialGrossMarginPct: getNumberState('input_number.cannabis_financial_gross_margin_pct', 58.4),

    // Compliance extension
    cannabisLicenseDaysRemaining: getNumberState('input_number.cannabis_license_days_remaining', 187),
    cannabisDestructionEventCount: getNumberState('input_number.cannabis_destruction_event_count', 2),
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

async function updateState(
  ha: ReturnType<typeof createHomeAssistantAdapter>,
  state: FarmState,
  profile: FarmProfile,
  manualChanges?: Map<string, number>,
  isEntityRecentlyManuallyChanged?: (entityId: string, gracePeriodMs?: number) => Promise<boolean>
): Promise<void> {
  const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));
  const states = await ha.getAllStates();

  // Helper: Skip write if entity was manually changed (agent control takes precedence)
  const setIfNotManuallyChanged = async (
    entityId: string,
    value: boolean | number | string
  ): Promise<void> => {
    if (!isEntityRecentlyManuallyChanged) {
      // No check function provided, write normally
      if (typeof value === 'boolean') return ha.setInputBoolean(entityId, value);
      if (typeof value === 'number') return ha.setInputNumber(entityId, value);
      if (typeof value === 'string') return ha.setInputSelect(entityId, value);
      return;
    }

    const isManual = await isEntityRecentlyManuallyChanged(entityId, 5000); // 5s grace period
    if (isManual) {
      // Entity was manually changed, skip simulator write
      return;
    }

    // Not manually changed, write normally
    if (typeof value === 'boolean') return ha.setInputBoolean(entityId, value);
    if (typeof value === 'number') return ha.setInputNumber(entityId, value);
    if (typeof value === 'string') return ha.setInputSelect(entityId, value);
  };
  const incidentMode = normalizeIncidentMode(
    states.find((e) => e.entity_id === 'input_select.incident_mode')?.state
  );
  const effectiveProfile = profileForIncident(incidentMode, profile);
  const bias = PROFILE_BIASES[effectiveProfile];

  state.windSpeed = clamp(state.windSpeed + bias.windBias + (Math.random() - 0.5) * WIND_VARIATION * 2, 0, 100);
  state.windDirection = (state.windDirection + (Math.random() - 0.5) * 10 + 360) % 360;
  state.barometricPressure = clamp(state.barometricPressure + (Math.random() - 0.5) * 0.02, 28, 32);

  if (Math.random() < bias.rainfallChance) {
    state.rainfallToday += 0.1;
    state.rainwaterCollection += Math.random() * 50;
  }

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

  state.soilMoistureNorth = clamp(state.soilMoistureNorth + bias.moistureDrift, 0, 100);
  state.soilMoistureSouth = clamp(state.soilMoistureSouth + bias.moistureDrift, 0, 100);
  state.soilMoistureWest = clamp(state.soilMoistureWest + bias.moistureDrift, 0, 100);
  state.soilMoistureEast = clamp(state.soilMoistureEast + bias.moistureDrift, 0, 100);
  state.soilMoistureVegetable = clamp(state.soilMoistureVegetable + bias.moistureDrift, 0, 100);
  state.soilMoistureNursery = clamp(state.soilMoistureNursery + bias.moistureDrift, 0, 100);

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

    // Keep climate in realistic cannabis/hemp operational bands for demo stability.
    return [clamp(newTemp, 55, 92), clamp(newHumidity, 35, 78)];
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

  const updateWell = (
    wellLevel: number,
    pumpOn: boolean,
    tankLevel: number,
    tankMax: number
  ): [number, number] => {
    let newWell = wellLevel;
    let newTank = tankLevel;
    if (pumpOn && wellLevel > 0) {
      newWell -= 0.1;
      newTank += TANK_INCREASE_RATE;
    }
    return [clamp(newWell, 0, 100), clamp(newTank, 0, tankMax)];
  };

  [state.well1Level, state.tankLevelMain] = updateWell(
    state.well1Level,
    getAnyBoolState('switch.pump_well_1', 'input_boolean.pump_well_1'),
    state.tankLevelMain,
    100000
  );
  [state.well2Level, state.tankLevelSecondary] = updateWell(
    state.well2Level,
    getAnyBoolState('switch.pump_well_2', 'input_boolean.pump_well_2'),
    state.tankLevelSecondary,
    50000
  );

  const hour = new Date().getHours();
  const solarBase = hour >= 6 && hour <= 18 ? Math.sin((hour - 6) * Math.PI / 12) * 100 : 0;
  state.solarGeneration = clamp((solarBase + (Math.random() - 0.5) * 20) * bias.solarMultiplier, 0, 500);
  state.gridConsumption = clamp(45 + bias.loadBias + (Math.random() - 0.5) * 8, 10, 120);

  if (state.solarGeneration > state.gridConsumption) {
    state.batteryLevel = clamp(state.batteryLevel + 0.1, 0, 100);
  } else {
    state.batteryLevel = clamp(state.batteryLevel - 0.05, 0, 100);
  }

  state.greenhouseTempA = clamp(state.greenhouseTempA + bias.temperatureBias * 0.15, 55, 92);
  state.greenhouseTempB = clamp(state.greenhouseTempB + bias.temperatureBias * 0.15, 55, 92);
  state.greenhouseTempC = clamp(state.greenhouseTempC + bias.temperatureBias * 0.15, 55, 92);
  state.greenhouseHumidityA = clamp(state.greenhouseHumidityA + bias.humidityBias * 0.2, 35, 78);
  state.greenhouseHumidityB = clamp(state.greenhouseHumidityB + bias.humidityBias * 0.2, 35, 78);
  state.greenhouseHumidityC = clamp(state.greenhouseHumidityC + bias.humidityBias * 0.2, 35, 78);
  state.barnTemp = clamp(state.barnTemp + bias.temperatureBias * 0.1 + (Math.random() - 0.5) * TEMP_VARIATION, 32, 80);
  state.barnHumidity = clamp(state.barnHumidity + bias.humidityBias * 0.2 + (Math.random() - 0.5) * 2, 30, 90);
  state.chickenCoopTemp = state.barnTemp + 5;

  const irrigationDemand =
    getAnyBoolState(
      'switch.irrigation_north',
      'switch.irrigation_south',
      'switch.irrigation_west_pasture',
      'switch.irrigation_east_orchard',
      'switch.irrigation_vegetable',
      'switch.irrigation_nursery',
      'input_boolean.irrigation_north_field',
      'input_boolean.irrigation_south_field',
      'input_boolean.irrigation_grain_silo_a',
      'input_boolean.irrigation_grain_silo_b'
    ) || getAnyBoolState('switch.pump_main', 'switch.pump_well_1', 'switch.pump_well_2');

  const backupGeneratorOn = getAnyBoolState('switch.backup_generator', 'input_boolean.backup_generator');
  const baseFuelBurn = irrigationDemand ? 0.15 : 0.04;
  state.tractorFuel = clamp(state.tractorFuel - baseFuelBurn + (Math.random() - 0.5) * 0.03, 0, 100);
  state.harvesterFuel = clamp(state.harvesterFuel - baseFuelBurn * 0.8 + (Math.random() - 0.5) * 0.03, 0, 100);
  state.truckFuel1 = clamp(state.truckFuel1 - baseFuelBurn * 0.5 + (Math.random() - 0.5) * 0.03, 0, 100);
  state.truckFuel2 = clamp(state.truckFuel2 - baseFuelBurn * 0.45 + (Math.random() - 0.5) * 0.03, 0, 100);
  state.generatorFuel = clamp(
    state.generatorFuel - (backupGeneratorOn ? 0.22 : 0.01) + (Math.random() - 0.5) * 0.02,
    0,
    100
  );

  if (state.generatorFuel < 18 && Math.random() < 0.025) {
    state.generatorFuel = clamp(state.generatorFuel + 30 + Math.random() * 20, 0, 100);
  }
  if (state.tractorFuel < 12 && Math.random() < 0.02) state.tractorFuel = clamp(state.tractorFuel + 45, 0, 100);
  if (state.harvesterFuel < 12 && Math.random() < 0.02) state.harvesterFuel = clamp(state.harvesterFuel + 40, 0, 100);
  if (state.truckFuel1 < 12 && Math.random() < 0.02) state.truckFuel1 = clamp(state.truckFuel1 + 38, 0, 100);
  if (state.truckFuel2 < 12 && Math.random() < 0.02) state.truckFuel2 = clamp(state.truckFuel2 + 38, 0, 100);

  const yieldFactor =
    effectiveProfile === 'high_yield' ? 1.35 :
    effectiveProfile === 'drought' ? 0.55 :
    effectiveProfile === 'storm' ? 0.75 : 1;
  state.grainYield = clamp(state.grainYield + (0.7 + Math.random() * 1.8) * yieldFactor, 0, 60000);
  state.vegetableYield = clamp(state.vegetableYield + (0.5 + Math.random() * 1.2) * yieldFactor, 0, 40000);
  state.fruitYield = clamp(state.fruitYield + (0.25 + Math.random() * 0.8) * yieldFactor, 0, 25000);

  state.eggsToday = clamp(state.eggsToday + (Math.random() < 0.45 ? 1 : 0), 0, 500);
  state.milkToday = clamp(state.milkToday + (Math.random() < 0.4 ? 0.1 : 0), 0, 400);
  state.feedSiloLevel = clamp(state.feedSiloLevel - (0.02 + Math.random() * 0.06), 0, 100);
  if (state.feedSiloLevel < 20 && Math.random() < 0.02) {
    state.feedSiloLevel = clamp(state.feedSiloLevel + 45, 0, 100);
  }

  state.soilPhNorth = clamp(state.soilPhNorth + (Math.random() - 0.5) * 0.025, 5.5, 7.5);
  state.soilPhSouth = clamp(state.soilPhSouth + (Math.random() - 0.5) * 0.025, 5.5, 7.5);
  state.soilPhOrchard = clamp(state.soilPhOrchard + (Math.random() - 0.5) * 0.025, 5.5, 7.5);
  state.soilPhVegetable = clamp(state.soilPhVegetable + (Math.random() - 0.5) * 0.025, 5.5, 7.5);

  const nutrientDrift = irrigationDemand ? -0.06 : 0.03;
  state.nitrogenNorth = clamp(state.nitrogenNorth + nutrientDrift + (Math.random() - 0.5) * 0.45, 0, 100);
  state.nitrogenSouth = clamp(state.nitrogenSouth + nutrientDrift + (Math.random() - 0.5) * 0.45, 0, 100);
  state.phosphorus = clamp(state.phosphorus + nutrientDrift * 0.6 + (Math.random() - 0.5) * 0.35, 0, 100);
  state.potassium = clamp(state.potassium + nutrientDrift * 0.6 + (Math.random() - 0.5) * 0.35, 0, 100);

  state.waterPhMain = clamp(state.waterPhMain + (Math.random() - 0.5) * 0.02, 5.8, 8.2);
  state.waterPhNursery = clamp(state.waterPhNursery + (Math.random() - 0.5) * 0.02, 5.8, 8.2);

  const incidentActions: Array<Promise<unknown>> = [];

  if (incidentMode === 'storm') {
    state.windSpeed = clamp(Math.max(state.windSpeed, 66) + Math.random() * 3, 0, 100);
    state.barometricPressure = clamp(Math.min(state.barometricPressure, 29.25), 28, 32);
    state.rainfallToday = clamp(state.rainfallToday + 0.25, 0, 10);
    state.solarGeneration = clamp(Math.min(state.solarGeneration, 24), 0, 500);
    state.gridConsumption = clamp(Math.max(state.gridConsumption, 92), 10, 120);
    incidentActions.push(
      ha.setInputBoolean('input_boolean.storm_shutters', true),
      ha.setInputBoolean('input_boolean.security_lights_perimeter', true),
      ha.setSwitch('switch.security_lights', true)
    );
    state.cannabisScenario = 'Logistics Disruption';
  } else if (incidentMode === 'intrusion') {
    state.gridConsumption = clamp(Math.max(state.gridConsumption, 82), 10, 120);
    state.batteryLevel = clamp(Math.min(state.batteryLevel, 55), 0, 100);
    incidentActions.push(
      ha.setInputBoolean('input_boolean.motion_sensor_barn', true),
      ha.setInputBoolean('input_boolean.motion_sensor_equipment', true),
      ha.setInputBoolean('input_boolean.perimeter_alarm', true),
      ha.setSwitch('switch.perimeter_alarm', true),
      ha.setSwitch('switch.security_lights', true)
    );
    state.cannabisScenario = 'Security Intrusion';
  } else if (incidentMode === 'power_failure') {
    state.solarGeneration = clamp(Math.min(state.solarGeneration, 10), 0, 500);
    state.gridConsumption = clamp(Math.max(state.gridConsumption, 112), 10, 120);
    state.batteryLevel = clamp(Math.min(state.batteryLevel, 18), 0, 100);
    state.generatorFuel = clamp(Math.max(state.generatorFuel, 35), 0, 100);
    incidentActions.push(
      ha.setInputBoolean('input_boolean.backup_generator', true),
      ha.setSwitch('switch.backup_generator', true)
    );
    state.cannabisScenario = 'Utility Outage';
  }

  // Compliance + traceability simulation dynamics (METRC-style abstractions).
  if (Math.random() < 0.08) {
    state.transferStatus = TRANSFER_STATUSES[Math.floor(Math.random() * TRANSFER_STATUSES.length)] || 'Ready';
  }
  state.transferQueueCount = clamp(
    state.transferQueueCount + (Math.random() < 0.35 ? 1 : -1),
    0,
    40
  );

  const riskPressure = (100 - state.auditCompletenessPct) * 0.08 + state.transferQueueCount * 0.25;
  state.custodyBreakRisk = clamp(
    state.custodyBreakRisk + (Math.random() - 0.5) * 1.5 + riskPressure * 0.05,
    0,
    100
  );

  state.auditCompletenessPct = clamp(
    state.auditCompletenessPct + (Math.random() < 0.55 ? 0.25 : -0.35),
    70,
    100
  );
  state.qaReleaseReadiness = clamp(
    state.qaReleaseReadiness + (Math.random() < 0.5 ? 0.4 : -0.4),
    55,
    100
  );
  state.metrcSyncHealth = clamp(
    state.metrcSyncHealth + (Math.random() < 0.8 ? 0.2 : -0.8),
    75,
    100
  );

  if (Math.random() < 0.04) state.qaHoldActive = !state.qaHoldActive;
  if (Math.random() < 0.03) state.recallReadiness = !state.recallReadiness;

  if (Math.random() < 0.07) state.lastManifestId = createTag('MANIFEST');
  if (Math.random() < 0.07) state.lastPackageTag = createTag('PKG');
  if (Math.random() < 0.05) state.lastPlantBatchTag = createTag('PLANT');
  if (Math.random() < 0.04) state.lastCoaId = createTag('COA');

  // Cannabis enterprise scenario engine (controls + telemetry coupling).
  const activeScenario = state.cannabisScenario;
  const scenarioPressureMap: Record<string, number> = {
    'Normal Production': 0.1,
    'HVAC Saturation': 0.78,
    'Fertigation Drift': 0.66,
    'Security Intrusion': 0.92,
    'Utility Outage': 0.88,
    'Compliance Drift': 0.72,
    'Logistics Disruption': 0.68,
  };
  const scenarioPressure = scenarioPressureMap[activeScenario] ?? 0.1;
  const hvacSaturation = activeScenario === 'HVAC Saturation' || incidentMode === 'power_failure';
  const fertigationDrift = activeScenario === 'Fertigation Drift';
  const securityIntrusion = activeScenario === 'Security Intrusion' || incidentMode === 'intrusion';
  const utilityOutage = activeScenario === 'Utility Outage' || incidentMode === 'power_failure';
  const complianceDrift = activeScenario === 'Compliance Drift';
  const logisticsDisruption = activeScenario === 'Logistics Disruption' || incidentMode === 'storm';
  const irrigationDemandCannabis =
    state.cannabisZoneVegIrrigation ||
    state.cannabisZoneFlowerIrrigation ||
    state.cannabisGreenhouseIrrigation ||
    state.cannabisHempBlockIrrigation;

  const envTempBias = (hvacSaturation ? 1.1 : 0) + (utilityOutage ? 1.3 : 0) + bias.temperatureBias * 0.2;
  const envRhBias = (hvacSaturation ? 2.2 : 0) + (fertigationDrift ? 1.5 : 0) + bias.humidityBias * 0.2;
  state.cannabisAirTempF = clamp(state.cannabisAirTempF + envTempBias + (Math.random() - 0.5) * 0.8, 62, 90);
  state.cannabisLeafTempF = clamp(state.cannabisLeafTempF + envTempBias * 0.9 + (Math.random() - 0.5) * 0.7, 60, 88);
  state.cannabisRhPct = clamp(state.cannabisRhPct + envRhBias + (Math.random() - 0.5) * 1.4, 42, 76);
  state.cannabisCo2Ppm = clamp(
    state.cannabisCo2Ppm +
      (state.cannabisCo2InjectEnable ? 9 : -7) +
      (state.cannabisHvacEnable ? -2 : 2) -
      (state.cannabisHvacLoadPct > 82 ? 4 : 0) +
      (Math.random() - 0.5) * 12,
    380,
    1500
  );
  state.cannabisPpfd = clamp(state.cannabisPpfd + (Math.random() - 0.5) * 12 - (utilityOutage ? 14 : 0), 320, 1100);
  state.cannabisDli = clamp(state.cannabisDli + (Math.random() - 0.5) * 0.6 + (utilityOutage ? -0.9 : 0), 20, 52);
  state.cannabisHvacLoadPct = clamp(
    state.cannabisHvacLoadPct +
      (state.cannabisHvacEnable ? 0.3 : -1.2) +
      (hvacSaturation ? 4.5 : 0) +
      (utilityOutage ? 3.6 : 0) +
      (Math.random() - 0.5) * 2.2,
    12,
    100
  );
  state.cannabisDehuLoadPct = clamp(
    state.cannabisDehuLoadPct +
      (state.cannabisDehuEnable ? 0.25 : -1.0) +
      (state.cannabisRhPct > 64 ? 1.8 : -1.1) +
      (Math.random() - 0.5) * 2.0,
    8,
    100
  );

  state.cannabisZoneACycles = clamp(
    state.cannabisZoneACycles + (irrigationDemandCannabis ? 0.8 : -0.2) + (fertigationDrift ? 0.7 : 0),
    0,
    60
  );
  state.cannabisZoneBCycles = clamp(
    state.cannabisZoneBCycles + (irrigationDemandCannabis ? 0.7 : -0.2) + (fertigationDrift ? 0.6 : 0),
    0,
    60
  );
  state.cannabisEcIn = clamp(state.cannabisEcIn + (fertigationDrift ? 0.05 : 0) + (Math.random() - 0.5) * 0.03, 1.4, 3.2);
  state.cannabisPhIn = clamp(state.cannabisPhIn + (fertigationDrift ? 0.06 : 0) + (Math.random() - 0.5) * 0.03, 5.2, 6.8);
  state.cannabisDoseRateMlMin = clamp(
    state.cannabisDoseRateMlMin + (irrigationDemandCannabis ? 1.2 : -0.8) + (fertigationDrift ? 2.3 : 0),
    60,
    320
  );
  state.cannabisRunoffEc = clamp(state.cannabisRunoffEc + (state.cannabisEcIn - 2.2) * 0.04 + (Math.random() - 0.5) * 0.03, 1.6, 3.6);
  state.cannabisRunoffPh = clamp(state.cannabisRunoffPh + (state.cannabisPhIn - 5.9) * 0.08 + (Math.random() - 0.5) * 0.03, 5.4, 6.8);
  state.cannabisReclaimQualityIdx = clamp(
    state.cannabisReclaimQualityIdx - (fertigationDrift ? 1.4 : 0.2) + (Math.random() - 0.5) * 0.9,
    60,
    98
  );

  state.cannabisDryRoomTempF = clamp(state.cannabisDryRoomTempF + (Math.random() - 0.5) * 0.5 + (utilityOutage ? 0.5 : 0), 57, 69);
  state.cannabisDryRoomRhPct = clamp(state.cannabisDryRoomRhPct + (Math.random() - 0.5) * 0.9 + (state.cannabisDehuEnable ? -0.3 : 0.5), 49, 66);
  state.cannabisCureProgressPct = clamp(state.cannabisCureProgressPct + (Math.random() * 0.25), 0, 100);
  state.cannabisMoistureContentPct = clamp(
    state.cannabisMoistureContentPct - 0.02 + (state.cannabisDryRoomRhPct > 62 ? 0.03 : -0.01),
    8,
    15
  );

  state.cannabisExtractionQueueCount = clamp(
    state.cannabisExtractionQueueCount + (Math.random() < 0.45 ? 1 : -1) + (complianceDrift ? 2 : 0),
    0,
    500
  );
  state.cannabisPackagingThroughputUnitsHr = clamp(
    state.cannabisPackagingThroughputUnitsHr +
      (state.cannabisPackagingLineEnable ? 12 : -18) +
      (logisticsDisruption ? -24 : 0) +
      (state.cannabisProcessingLineFault ? -26 : 0) +
      (Math.random() - 0.5) * 12,
    320,
    2600
  );
  state.cannabisLineUptimePct = clamp(
    state.cannabisLineUptimePct +
      (state.cannabisProcessingLineEnable ? 0.3 : -1.8) -
      (utilityOutage ? 2.6 : 0) -
      (state.cannabisProcessingLineFault ? 1.7 : 0) +
      (Math.random() - 0.5) * 0.7,
    55,
    100
  );
  state.cannabisQcHoldCount = clamp(state.cannabisQcHoldCount + (complianceDrift ? 0.7 : -0.2) + (Math.random() - 0.5) * 0.5, 0, 200);

  const staffingPressure = scenarioPressure * 18 + (securityIntrusion ? 8 : 0) + (utilityOutage ? 10 : 0);
  state.cannabisStaffOnShiftTotal = clamp(
    state.cannabisStaffOnShiftTotal - staffingPressure * 0.02 + (Math.random() - 0.5) * 1.4,
    40,
    180
  );
  state.cannabisStaffCultivation = clamp(state.cannabisStaffCultivation + (Math.random() - 0.5) * 0.8, 12, 90);
  state.cannabisStaffProcessing = clamp(state.cannabisStaffProcessing + (Math.random() - 0.5) * 0.6, 8, 60);
  state.cannabisStaffSecurity = clamp(
    state.cannabisStaffSecurity + (securityIntrusion ? 0.9 : -0.2) + (Math.random() - 0.5) * 0.6,
    6,
    40
  );
  state.cannabisStaffLogistics = clamp(
    state.cannabisStaffLogistics + (logisticsDisruption ? -0.8 : 0.2) + (Math.random() - 0.5) * 0.7,
    4,
    40
  );
  state.cannabisWorkOrdersOpen = clamp(
    state.cannabisWorkOrdersOpen + (staffingPressure > 12 ? 1.4 : -0.5) + (Math.random() - 0.5) * 1.2,
    4,
    320
  );
  state.cannabisWorkOrdersOverdue = clamp(
    state.cannabisWorkOrdersOverdue +
      (state.cannabisWorkOrdersOpen > 60 ? 0.8 : -0.2) +
      (logisticsDisruption ? 0.9 : 0) +
      (Math.random() - 0.5) * 0.4,
    0,
    120
  );
  state.cannabisScheduleAdherencePct = clamp(
    state.cannabisScheduleAdherencePct -
      (state.cannabisWorkOrdersOverdue * 0.04) -
      (state.cannabisStaffOnShiftTotal < 78 ? 1.2 : 0) -
      (scenarioPressure * 0.9) +
      (Math.random() - 0.5) * 0.8,
    58,
    100
  );

  state.cannabisSecurityIntrusion = securityIntrusion;
  state.cannabisPerimeterLockdown = securityIntrusion || state.cannabisSecurityPosture === 'Lockdown';
  state.cannabisVaultLock = securityIntrusion || state.cannabisVaultExceptionActive ? true : state.cannabisVaultLock;
  state.cannabisVaultExceptionActive = complianceDrift || securityIntrusion ? Math.random() < 0.35 : Math.random() < 0.04;
  state.cannabisBadgeSystemDegraded = utilityOutage ? Math.random() < 0.4 : Math.random() < 0.05;
  state.cannabisStaffShortageAlert = state.cannabisStaffOnShiftTotal < 80 || staffingPressure > 16;
  state.cannabisScheduleDisruptionActive = logisticsDisruption || state.cannabisScheduleAdherencePct < 86;
  state.cannabisTransportDelay = logisticsDisruption || state.transferQueueCount > 12;
  state.cannabisAccessDeniedEvents1h = clamp(
    state.cannabisAccessDeniedEvents1h +
      (securityIntrusion ? 2.5 : 0.3) +
      (state.cannabisPerimeterLockdown ? 1.2 : 0) +
      (Math.random() - 0.5) * 1.1,
    0,
    200
  );
  state.cannabisGuardCoveragePct = clamp(
    state.cannabisGuardCoveragePct + (securityIntrusion ? 1.2 : -0.2) - (state.cannabisStaffShortageAlert ? 1.0 : 0) + (Math.random() - 0.5) * 0.8,
    64,
    100
  );

  if (securityIntrusion) {
    state.cannabisSecurityPosture = 'Lockdown';
  } else if (scenarioPressure > 0.45 || incidentMode === 'storm') {
    state.cannabisSecurityPosture = 'Elevated';
  } else {
    state.cannabisSecurityPosture = 'Normal';
  }

  state.cannabisCameraHealthPct = clamp(
    state.cannabisCameraHealthPct - (utilityOutage ? 2.2 : 0.2) - (state.cannabisCameraLinkDegraded ? 0.9 : 0) + (Math.random() - 0.5) * 0.7,
    52,
    100
  );
  state.cannabisCameraAlertCount = clamp(
    state.cannabisCameraAlertCount + (securityIntrusion ? 1.8 : -0.2) + (Math.random() - 0.5) * 0.6,
    0,
    300
  );
  state.cannabisCameraLinkDegraded = state.cannabisCameraHealthPct < 80 || utilityOutage;
  state.cannabisCameraPtzPatrol = !state.cannabisPerimeterLockdown;
  state.cannabisDroneMissionState = securityIntrusion || logisticsDisruption ? 'Survey' : state.cannabisDroneMissionState;
  if (state.cannabisDroneMissionState === 'Survey') {
    state.cannabisDroneProgressPct = clamp(state.cannabisDroneProgressPct + 6 + Math.random() * 4, 0, 100);
    state.cannabisDroneBatteryPct = clamp(state.cannabisDroneBatteryPct - (2 + Math.random() * 1.5), 0, 100);
  } else {
    state.cannabisDroneProgressPct = clamp(state.cannabisDroneProgressPct - 2, 0, 100);
    state.cannabisDroneBatteryPct = clamp(state.cannabisDroneBatteryPct + 0.9, 0, 100);
  }
  if (state.cannabisDroneProgressPct >= 100) {
    state.cannabisDroneMissionState = 'Return';
  } else if (state.cannabisDroneMissionState === 'Return' && state.cannabisDroneProgressPct <= 5) {
    state.cannabisDroneMissionState = 'Idle';
  }
  if (state.cannabisDroneMissionState === 'Return') {
    state.cannabisDroneProgressPct = clamp(state.cannabisDroneProgressPct - 8, 0, 100);
  }
  state.cannabisDroneAnomalyScore = clamp(
    state.cannabisDroneAnomalyScore + (securityIntrusion ? 8 : -0.5) + (logisticsDisruption ? 3 : 0) + (Math.random() - 0.5) * 2.2,
    0,
    100
  );
  state.cannabisDroneGeofenceBreach =
    securityIntrusion && (Math.random() < 0.2 || state.cannabisDroneAnomalyScore > 68);

  state.cannabisTransferEtaMin = clamp(
    state.cannabisTransferEtaMin + (logisticsDisruption ? 9 : -2) + (Math.random() - 0.5) * 3.2,
    15,
    720
  );
  state.cannabisTransportRiskIdx = clamp(
    state.cannabisTransportRiskIdx +
      (logisticsDisruption ? 4.5 : -0.4) +
      (securityIntrusion ? 5.5 : 0) +
      (scenarioPressure * 1.6) +
      (Math.random() - 0.5) * 2.1,
    2,
    100
  );
  state.cannabisTotalDriedFlowerLbs = clamp(state.cannabisTotalDriedFlowerLbs + (state.cannabisCureProgressPct > 55 ? 9 : 3), 0, 200000);
  state.cannabisTotalExtractLiters = clamp(
    state.cannabisTotalExtractLiters + (state.cannabisExtractionQueueCount > 40 ? 1.8 : 0.6) - (state.cannabisProcessingLineFault ? 1.2 : 0),
    0,
    50000
  );
  state.cannabisTotalPackagedUnits = clamp(
    state.cannabisTotalPackagedUnits + state.cannabisPackagingThroughputUnitsHr / 12,
    0,
    2000000
  );

  state.cannabisHvacAlarm = state.cannabisHvacLoadPct > 88 || hvacSaturation;
  state.cannabisDehuAlarm = state.cannabisDehuLoadPct > 86 || state.cannabisRhPct > 72;
  state.cannabisFertigationAlarm =
    fertigationDrift || state.cannabisPhIn < 5.5 || state.cannabisPhIn > 6.5 || state.cannabisEcIn > 2.8;
  state.cannabisProcessingLineFault = utilityOutage ? Math.random() < 0.3 : Math.random() < 0.06;

  if (Math.random() < 0.03) {
    state.cannabisShiftMode = (['Day', 'Swing', 'Night'] as const)[Math.floor(Math.random() * 3)] || 'Day';
  }
  if (Math.random() < 0.02) {
    state.cannabisSiteFocus =
      (['Site A Indoor', 'Site B Greenhouse', 'Site C Outdoor Hemp'] as const)[
        Math.floor(Math.random() * 3)
      ] || 'Site A Indoor';
  }
  state.cannabisDispatchChannelStatus = state.cannabisPerimeterLockdown
    ? 'LOCKDOWN'
    : state.cannabisTransportDelay
      ? 'DELAYED'
      : scenarioPressure > 0.5
        ? 'WATCH'
        : 'CLEAR';
  state.cannabisNextCriticalTask =
    CANNABIS_CRITICAL_TASKS[activeScenario as keyof typeof CANNABIS_CRITICAL_TASKS] ||
    CANNABIS_CRITICAL_TASKS['Normal Production'];
  if (Math.random() < 0.06) {
    state.cannabisManifestLiveId = createTag('CAN-MAN');
  }

  // Normalize floating-point output for deterministic card display precision.
  state.windSpeed = roundTo(state.windSpeed, 1);
  state.windDirection = roundTo(state.windDirection, 0);
  state.barometricPressure = roundTo(state.barometricPressure, 2);
  state.rainfallToday = roundTo(state.rainfallToday, 2);
  state.soilMoistureNorth = roundTo(state.soilMoistureNorth, 1);
  state.soilMoistureSouth = roundTo(state.soilMoistureSouth, 1);
  state.soilMoistureWest = roundTo(state.soilMoistureWest, 1);
  state.soilMoistureEast = roundTo(state.soilMoistureEast, 1);
  state.soilMoistureVegetable = roundTo(state.soilMoistureVegetable, 1);
  state.soilMoistureNursery = roundTo(state.soilMoistureNursery, 1);
  state.greenhouseTempA = roundTo(state.greenhouseTempA, 1);
  state.greenhouseTempB = roundTo(state.greenhouseTempB, 1);
  state.greenhouseTempC = roundTo(state.greenhouseTempC, 1);
  state.greenhouseHumidityA = roundTo(state.greenhouseHumidityA, 1);
  state.greenhouseHumidityB = roundTo(state.greenhouseHumidityB, 1);
  state.greenhouseHumidityC = roundTo(state.greenhouseHumidityC, 1);
  state.tankLevelMain = roundTo(state.tankLevelMain, 0);
  state.tankLevelSecondary = roundTo(state.tankLevelSecondary, 0);
  state.tankLevelNursery = roundTo(state.tankLevelNursery, 0);
  state.well1Level = roundTo(state.well1Level, 1);
  state.well2Level = roundTo(state.well2Level, 1);
  state.pondLevel = roundTo(state.pondLevel, 1);
  state.rainwaterCollection = roundTo(state.rainwaterCollection, 0);
  state.solarGeneration = roundTo(state.solarGeneration, 1);
  state.gridConsumption = roundTo(state.gridConsumption, 1);
  state.batteryLevel = roundTo(state.batteryLevel, 1);
  state.generatorFuel = roundTo(state.generatorFuel, 1);
  state.tractorFuel = roundTo(state.tractorFuel, 1);
  state.harvesterFuel = roundTo(state.harvesterFuel, 1);
  state.truckFuel1 = roundTo(state.truckFuel1, 1);
  state.truckFuel2 = roundTo(state.truckFuel2, 1);
  state.barnTemp = roundTo(state.barnTemp, 1);
  state.barnHumidity = roundTo(state.barnHumidity, 1);
  state.chickenCoopTemp = roundTo(state.chickenCoopTemp, 1);
  state.grainYield = roundTo(state.grainYield, 0);
  state.vegetableYield = roundTo(state.vegetableYield, 0);
  state.fruitYield = roundTo(state.fruitYield, 0);
  state.eggsToday = roundTo(state.eggsToday, 0);
  state.milkToday = roundTo(state.milkToday, 1);
  state.feedSiloLevel = roundTo(state.feedSiloLevel, 1);
  state.soilPhNorth = roundTo(state.soilPhNorth, 2);
  state.soilPhSouth = roundTo(state.soilPhSouth, 2);
  state.soilPhOrchard = roundTo(state.soilPhOrchard, 2);
  state.soilPhVegetable = roundTo(state.soilPhVegetable, 2);
  state.nitrogenNorth = roundTo(state.nitrogenNorth, 1);
  state.nitrogenSouth = roundTo(state.nitrogenSouth, 1);
  state.phosphorus = roundTo(state.phosphorus, 1);
  state.potassium = roundTo(state.potassium, 1);
  state.waterPhMain = roundTo(state.waterPhMain, 2);
  state.waterPhNursery = roundTo(state.waterPhNursery, 2);
  state.transferQueueCount = roundTo(state.transferQueueCount, 0);
  state.auditCompletenessPct = roundTo(state.auditCompletenessPct, 1);
  state.qaReleaseReadiness = roundTo(state.qaReleaseReadiness, 1);
  state.metrcSyncHealth = roundTo(state.metrcSyncHealth, 1);
  state.custodyBreakRisk = roundTo(state.custodyBreakRisk, 1);
  state.cannabisAirTempF = roundTo(state.cannabisAirTempF, 1);
  state.cannabisLeafTempF = roundTo(state.cannabisLeafTempF, 1);
  state.cannabisRhPct = roundTo(state.cannabisRhPct, 1);
  state.cannabisCo2Ppm = roundTo(state.cannabisCo2Ppm, 0);
  state.cannabisPpfd = roundTo(state.cannabisPpfd, 0);
  state.cannabisDli = roundTo(state.cannabisDli, 1);
  state.cannabisHvacLoadPct = roundTo(state.cannabisHvacLoadPct, 1);
  state.cannabisDehuLoadPct = roundTo(state.cannabisDehuLoadPct, 1);
  state.cannabisZoneACycles = roundTo(state.cannabisZoneACycles, 0);
  state.cannabisZoneBCycles = roundTo(state.cannabisZoneBCycles, 0);
  state.cannabisEcIn = roundTo(state.cannabisEcIn, 2);
  state.cannabisPhIn = roundTo(state.cannabisPhIn, 2);
  state.cannabisDoseRateMlMin = roundTo(state.cannabisDoseRateMlMin, 0);
  state.cannabisRunoffEc = roundTo(state.cannabisRunoffEc, 2);
  state.cannabisRunoffPh = roundTo(state.cannabisRunoffPh, 2);
  state.cannabisReclaimQualityIdx = roundTo(state.cannabisReclaimQualityIdx, 1);
  state.cannabisDryRoomTempF = roundTo(state.cannabisDryRoomTempF, 1);
  state.cannabisDryRoomRhPct = roundTo(state.cannabisDryRoomRhPct, 1);
  state.cannabisCureProgressPct = roundTo(state.cannabisCureProgressPct, 1);
  state.cannabisMoistureContentPct = roundTo(state.cannabisMoistureContentPct, 1);
  state.cannabisExtractionQueueCount = roundTo(state.cannabisExtractionQueueCount, 0);
  state.cannabisPackagingThroughputUnitsHr = roundTo(state.cannabisPackagingThroughputUnitsHr, 0);
  state.cannabisLineUptimePct = roundTo(state.cannabisLineUptimePct, 1);
  state.cannabisQcHoldCount = roundTo(state.cannabisQcHoldCount, 0);
  state.cannabisAccessDeniedEvents1h = roundTo(state.cannabisAccessDeniedEvents1h, 0);
  state.cannabisGuardCoveragePct = roundTo(state.cannabisGuardCoveragePct, 1);
  state.cannabisStaffOnShiftTotal = roundTo(state.cannabisStaffOnShiftTotal, 0);
  state.cannabisStaffCultivation = roundTo(state.cannabisStaffCultivation, 0);
  state.cannabisStaffProcessing = roundTo(state.cannabisStaffProcessing, 0);
  state.cannabisStaffSecurity = roundTo(state.cannabisStaffSecurity, 0);
  state.cannabisStaffLogistics = roundTo(state.cannabisStaffLogistics, 0);
  state.cannabisWorkOrdersOpen = roundTo(state.cannabisWorkOrdersOpen, 0);
  state.cannabisWorkOrdersOverdue = roundTo(state.cannabisWorkOrdersOverdue, 0);
  state.cannabisScheduleAdherencePct = roundTo(state.cannabisScheduleAdherencePct, 1);
  state.cannabisCameraHealthPct = roundTo(state.cannabisCameraHealthPct, 1);
  state.cannabisCameraAlertCount = roundTo(state.cannabisCameraAlertCount, 0);
  state.cannabisDroneProgressPct = roundTo(state.cannabisDroneProgressPct, 1);
  state.cannabisDroneBatteryPct = roundTo(state.cannabisDroneBatteryPct, 1);
  state.cannabisDroneAnomalyScore = roundTo(state.cannabisDroneAnomalyScore, 1);
  state.cannabisTransferEtaMin = roundTo(state.cannabisTransferEtaMin, 0);
  state.cannabisTransportRiskIdx = roundTo(state.cannabisTransportRiskIdx, 1);
  state.cannabisTotalDriedFlowerLbs = roundTo(state.cannabisTotalDriedFlowerLbs, 0);
  state.cannabisTotalExtractLiters = roundTo(state.cannabisTotalExtractLiters, 1);
  state.cannabisTotalPackagedUnits = roundTo(state.cannabisTotalPackagedUnits, 0);

  // === GROW ROOM PHYSICS ===
  const STAGE_ORDER = [
    'Clone', 'Veg', 'Transition',
    'Flower Wk1', 'Flower Wk2', 'Flower Wk3', 'Flower Wk4',
    'Flower Wk5', 'Flower Wk6', 'Flower Wk7', 'Flower Wk8',
    'Flush', 'Harvest', 'Empty',
  ];
  const STAGE_DURATIONS: Record<string, number> = {
    Clone: 14, Veg: 28, Transition: 7,
    'Flower Wk1': 7, 'Flower Wk2': 7, 'Flower Wk3': 7, 'Flower Wk4': 7,
    'Flower Wk5': 7, 'Flower Wk6': 7, 'Flower Wk7': 7, 'Flower Wk8': 7,
    Flush: 10, Harvest: 1, Empty: 999,
  };

  type RoomKey = 'A' | 'B' | 'C' | 'D';
  const advanceRoom = (
    stage: string,
    days: number
  ): { stage: string; days: number } => {
    const duration = STAGE_DURATIONS[stage] ?? 7;
    if (days >= duration && stage !== 'Empty') {
      const idx = STAGE_ORDER.indexOf(stage);
      const nextStage = idx >= 0 && idx < STAGE_ORDER.length - 1 ? STAGE_ORDER[idx + 1] : 'Empty';
      return { stage: nextStage, days: 0 };
    }
    // Increment days once per ~20 ticks (roughly 1 day per 20 sim ticks)
    const newDays = Math.random() < 0.05 ? days + 1 : days;
    return { stage, days: newDays };
  };

  const roomA = advanceRoom(state.cannabisRoomAStage, state.cannabisRoomADaysInStage);
  state.cannabisRoomAStage = roomA.stage;
  state.cannabisRoomADaysInStage = roomA.days;

  const roomB = advanceRoom(state.cannabisRoomBStage, state.cannabisRoomBDaysInStage);
  state.cannabisRoomBStage = roomB.stage;
  state.cannabisRoomBDaysInStage = roomB.days;

  const roomC = advanceRoom(state.cannabisRoomCStage, state.cannabisRoomCDaysInStage);
  state.cannabisRoomCStage = roomC.stage;
  state.cannabisRoomCDaysInStage = roomC.days;

  const roomD = advanceRoom(state.cannabisRoomDStage, state.cannabisRoomDDaysInStage);
  state.cannabisRoomDStage = roomD.stage;
  state.cannabisRoomDDaysInStage = roomD.days;

  // === IPM PHYSICS ===
  const isFlowerBlackout = (stage: string, days: number) => stage.startsWith('Flower') && days >= 10;

  // Pest pressure drift: +0.08 baseline, random noise
  const ipmDrift = 0.08 + (Math.random() - 0.5) * 0.04;
  state.cannabisIpmPestPressureRoomA = clamp(state.cannabisIpmPestPressureRoomA + ipmDrift, 0, 10);
  state.cannabisIpmPestPressureRoomB = clamp(state.cannabisIpmPestPressureRoomB + ipmDrift * 0.9, 0, 10);
  state.cannabisIpmPestPressureRoomC = clamp(state.cannabisIpmPestPressureRoomC + ipmDrift * 1.1, 0, 10);
  state.cannabisIpmPestPressureRoomD = clamp(state.cannabisIpmPestPressureRoomD + ipmDrift * 0.95, 0, 10);

  // Spray events (random ~2% chance/tick, blocked in flower blackout)
  if (Math.random() < 0.02 && !isFlowerBlackout(state.cannabisRoomAStage, state.cannabisRoomADaysInStage)) {
    state.cannabisIpmPestPressureRoomA = clamp(state.cannabisIpmPestPressureRoomA - 3.0, 0, 10);
    state.cannabisIpmDaysSinceSprayRoomA = 0;
  } else {
    state.cannabisIpmDaysSinceSprayRoomA = Math.min(state.cannabisIpmDaysSinceSprayRoomA + (Math.random() < 0.05 ? 1 : 0), 60);
  }
  if (Math.random() < 0.02 && !isFlowerBlackout(state.cannabisRoomBStage, state.cannabisRoomBDaysInStage)) {
    state.cannabisIpmPestPressureRoomB = clamp(state.cannabisIpmPestPressureRoomB - 3.0, 0, 10);
    state.cannabisIpmDaysSinceSprayRoomB = 0;
  } else {
    state.cannabisIpmDaysSinceSprayRoomB = Math.min(state.cannabisIpmDaysSinceSprayRoomB + (Math.random() < 0.05 ? 1 : 0), 60);
  }
  if (Math.random() < 0.02 && !isFlowerBlackout(state.cannabisRoomCStage, state.cannabisRoomCDaysInStage)) {
    state.cannabisIpmPestPressureRoomC = clamp(state.cannabisIpmPestPressureRoomC - 3.0, 0, 10);
    state.cannabisIpmDaysSinceSprayRoomC = 0;
  } else {
    state.cannabisIpmDaysSinceSprayRoomC = Math.min(state.cannabisIpmDaysSinceSprayRoomC + (Math.random() < 0.05 ? 1 : 0), 60);
  }
  if (Math.random() < 0.02 && !isFlowerBlackout(state.cannabisRoomDStage, state.cannabisRoomDDaysInStage)) {
    state.cannabisIpmPestPressureRoomD = clamp(state.cannabisIpmPestPressureRoomD - 3.0, 0, 10);
    state.cannabisIpmDaysSinceSprayRoomD = 0;
  } else {
    state.cannabisIpmDaysSinceSprayRoomD = Math.min(state.cannabisIpmDaysSinceSprayRoomD + (Math.random() < 0.05 ? 1 : 0), 60);
  }

  // Scouting due: flip every ~7 day cycle approximation
  if (state.cannabisIpmDaysSinceSprayRoomA >= 7) state.cannabisIpmScoutingDueRoomA = true;
  if (state.cannabisIpmDaysSinceSprayRoomB >= 7) state.cannabisIpmScoutingDueRoomB = true;
  if (state.cannabisIpmDaysSinceSprayRoomC >= 7) state.cannabisIpmScoutingDueRoomC = true;
  if (state.cannabisIpmDaysSinceSprayRoomD >= 7) state.cannabisIpmScoutingDueRoomD = true;

  // Round IPM values
  state.cannabisIpmPestPressureRoomA = roundTo(state.cannabisIpmPestPressureRoomA, 1);
  state.cannabisIpmPestPressureRoomB = roundTo(state.cannabisIpmPestPressureRoomB, 1);
  state.cannabisIpmPestPressureRoomC = roundTo(state.cannabisIpmPestPressureRoomC, 1);
  state.cannabisIpmPestPressureRoomD = roundTo(state.cannabisIpmPestPressureRoomD, 1);

  // === LAB PHYSICS ===
  if (state.cannabisLabExtractionActive) {
    state.cannabisLabActiveBatchDurationHrs = state.cannabisLabActiveBatchDurationHrs + 0.25;
    // Batch completes around 8 hrs
    if (state.cannabisLabActiveBatchDurationHrs >= 8.0) {
      const yieldPct = clamp(75 + (Math.random() - 0.5) * 10, 60, 95);
      state.cannabisLabExtractionYieldPct = roundTo(yieldPct, 1);
      state.cannabisLabDistillateLiters = clamp(state.cannabisLabDistillateLiters + yieldPct * 0.05, 0, 50);
      state.cannabisLabActiveBatchDurationHrs = 0;
      state.cannabisLabBatchQueueCount = Math.max(0, state.cannabisLabBatchQueueCount - 1);
    }
  }
  state.cannabisLabSolventRecoveryPct = clamp(state.cannabisLabSolventRecoveryPct + (Math.random() - 0.5) * 0.5, 82, 95);
  state.cannabisLabRoomTempF = clamp(state.cannabisLabRoomTempF + (Math.random() - 0.5) * 0.3, 50, 85);
  state.cannabisLabRoomRhPct = clamp(state.cannabisLabRoomRhPct + (Math.random() - 0.5) * 0.5, 10, 60);
  state.cannabisLabVentilationPct = clamp(state.cannabisLabVentilationPct + (Math.random() - 0.5) * 2, 0, 100);

  // Safety interlock fault: 0.5% chance per tick, auto-clears
  if (!state.cannabisLabSolventAlarm && Math.random() < 0.005) {
    state.cannabisLabSafetyInterlockOk = false;
  } else if (!state.cannabisLabSafetyInterlockOk && Math.random() < 0.33) {
    state.cannabisLabSafetyInterlockOk = true;
  }

  state.cannabisLabActiveBatchDurationHrs = roundTo(state.cannabisLabActiveBatchDurationHrs, 1);
  state.cannabisLabSolventRecoveryPct = roundTo(state.cannabisLabSolventRecoveryPct, 1);
  state.cannabisLabRoomTempF = roundTo(state.cannabisLabRoomTempF, 1);
  state.cannabisLabRoomRhPct = roundTo(state.cannabisLabRoomRhPct, 1);
  state.cannabisLabVentilationPct = roundTo(state.cannabisLabVentilationPct, 0);

  // === DISPENSARY PHYSICS ===
  const SALES_MULTIPLIER: Record<number, number> = {
    8: 0.4, 9: 0.6, 10: 0.7, 11: 0.9, 12: 1.2, 13: 1.1,
    14: 0.9, 15: 0.8, 16: 0.85, 17: 1.15, 18: 1.0, 19: 0.8,
    20: 0.6, 21: 0.3,
  };
  const salesMultiplier = SALES_MULTIPLIER[hour] ?? 0.5;
  const salesIncrement = salesMultiplier * 50 * (1 + (Math.random() - 0.5) * 0.3);
  state.cannabisDispensaryDailySalesUsd = clamp(state.cannabisDispensaryDailySalesUsd + salesIncrement, 0, 50000);
  state.cannabisDispensaryTransactionCount = clamp(
    Math.floor(state.cannabisDispensaryDailySalesUsd / Math.max(state.cannabisDispensaryAvgBasketUsd, 10)),
    0, 500
  );
  state.cannabisDispensaryAvgBasketUsd = clamp(
    state.cannabisDispensaryAvgBasketUsd + (Math.random() - 0.5) * 2,
    30, 200
  );
  state.cannabisDispensaryPatientCountToday = clamp(
    Math.floor(state.cannabisDispensaryTransactionCount * 0.95),
    0, 500
  );

  // Inventory depletion
  state.cannabisDispensaryFlowerInventoryGrams = clamp(
    state.cannabisDispensaryFlowerInventoryGrams - salesMultiplier * 3,
    0, 5000
  );
  state.cannabisDispensaryExtractInventoryGrams = clamp(
    state.cannabisDispensaryExtractInventoryGrams - salesMultiplier * 1,
    0, 2000
  );

  // Low inventory alert
  state.cannabisDispensaryLowInventoryAlert =
    state.cannabisDispensaryFlowerInventoryGrams < 100 ||
    state.cannabisDispensaryExtractInventoryGrams < 50;

  state.cannabisDispensaryDailySalesUsd = roundTo(state.cannabisDispensaryDailySalesUsd, 0);
  state.cannabisDispensaryAvgBasketUsd = roundTo(state.cannabisDispensaryAvgBasketUsd, 2);
  state.cannabisDispensaryFlowerInventoryGrams = roundTo(state.cannabisDispensaryFlowerInventoryGrams, 0);
  state.cannabisDispensaryExtractInventoryGrams = roundTo(state.cannabisDispensaryExtractInventoryGrams, 0);

  // === FINANCIAL PHYSICS ===
  const totalCost = state.cannabisFinancialLaborCostToday + state.cannabisFinancialEnergyCostToday;
  const flowerGrams = state.cannabisTotalDriedFlowerLbs * 453.6;
  state.cannabisFinancialCostPerGramFlower = flowerGrams > 0
    ? roundTo(totalCost / flowerGrams, 2)
    : state.cannabisFinancialCostPerGramFlower;

  const energyBias = activeScenario === 'HVAC Saturation' ? 1.15 : 1.0;
  state.cannabisFinancialEnergyCostToday = clamp(
    state.cannabisFinancialEnergyCostToday + energyBias * (Math.random() - 0.4) * 20,
    0, 5000
  );
  state.cannabisFinancialLaborCostToday = clamp(
    state.cannabisFinancialLaborCostToday + (Math.random() - 0.4) * 15,
    0, 10000
  );
  if (state.cannabisFinancialBatchRevenueUsd > 0) {
    state.cannabisFinancialGrossMarginPct = roundTo(
      ((state.cannabisFinancialBatchRevenueUsd - totalCost) / state.cannabisFinancialBatchRevenueUsd) * 100,
      1
    );
  }
  state.cannabisFinancialEnergyCostToday = roundTo(state.cannabisFinancialEnergyCostToday, 0);
  state.cannabisFinancialLaborCostToday = roundTo(state.cannabisFinancialLaborCostToday, 0);

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
    ha.setInputNumber('input_number.generator_fuel_level', state.generatorFuel),
    ha.setInputNumber('input_number.tractor_fuel', state.tractorFuel),
    ha.setInputNumber('input_number.harvester_fuel', state.harvesterFuel),
    ha.setInputNumber('input_number.truck_fuel_1', state.truckFuel1),
    ha.setInputNumber('input_number.truck_fuel_2', state.truckFuel2),
    ha.setInputNumber('input_number.barn_temp', state.barnTemp),
    ha.setInputNumber('input_number.barn_humidity', state.barnHumidity),
    ha.setInputNumber('input_number.chicken_coop_temp', state.chickenCoopTemp),
    ha.setInputNumber('input_number.yield_grain_current', state.grainYield),
    ha.setInputNumber('input_number.yield_vegetables_current', state.vegetableYield),
    ha.setInputNumber('input_number.yield_fruit_current', state.fruitYield),
    ha.setInputNumber('input_number.eggs_today', state.eggsToday),
    ha.setInputNumber('input_number.milk_today', state.milkToday),
    ha.setInputNumber('input_number.feed_silo_level', state.feedSiloLevel),
    ha.setInputNumber('input_number.soil_ph_north', state.soilPhNorth),
    ha.setInputNumber('input_number.soil_ph_south', state.soilPhSouth),
    ha.setInputNumber('input_number.soil_ph_orchard', state.soilPhOrchard),
    ha.setInputNumber('input_number.soil_ph_vegetable', state.soilPhVegetable),
    ha.setInputNumber('input_number.nitrogen_level_north', state.nitrogenNorth),
    ha.setInputNumber('input_number.nitrogen_level_south', state.nitrogenSouth),
    ha.setInputNumber('input_number.phosphorus_level', state.phosphorus),
    ha.setInputNumber('input_number.potassium_level', state.potassium),
    ha.setInputNumber('input_number.water_ph_main', state.waterPhMain),
    ha.setInputNumber('input_number.water_ph_nursery', state.waterPhNursery),
    ha.setInputNumber('input_number.transfer_queue_count', state.transferQueueCount),
    ha.setInputNumber('input_number.audit_completeness_pct', state.auditCompletenessPct),
    ha.setInputNumber('input_number.qa_release_readiness', state.qaReleaseReadiness),
    ha.setInputNumber('input_number.metrc_sync_health', state.metrcSyncHealth),
    ha.setInputNumber('input_number.custody_break_risk', state.custodyBreakRisk),
    ha.setInputBoolean('input_boolean.qa_hold_active', state.qaHoldActive),
    ha.setInputBoolean('input_boolean.recall_readiness', state.recallReadiness),
    ha.setInputSelect('input_select.transfer_status', state.transferStatus),
    ha.setInputText('input_text.metrc_manifest_id', state.lastManifestId),
    ha.setInputText('input_text.metrc_last_package_tag', state.lastPackageTag),
    ha.setInputText('input_text.metrc_last_plant_batch_tag', state.lastPlantBatchTag),
    ha.setInputText('input_text.metrc_last_coa_id', state.lastCoaId),
    ha.setInputNumber('input_number.cannabis_site_a_flower_air_temp_f', state.cannabisAirTempF),
    ha.setInputNumber('input_number.cannabis_site_a_flower_leaf_temp_f', state.cannabisLeafTempF),
    ha.setInputNumber('input_number.cannabis_site_a_flower_rh_pct', state.cannabisRhPct),
    ha.setInputNumber('input_number.cannabis_site_a_flower_co2_ppm', state.cannabisCo2Ppm),
    ha.setInputNumber('input_number.cannabis_site_a_flower_ppfd', state.cannabisPpfd),
    ha.setInputNumber('input_number.cannabis_site_a_flower_dli', state.cannabisDli),
    ha.setInputNumber('input_number.cannabis_site_a_hvac_load_pct', state.cannabisHvacLoadPct),
    ha.setInputNumber('input_number.cannabis_site_a_dehu_load_pct', state.cannabisDehuLoadPct),
    ha.setInputNumber('input_number.cannabis_irrigation_zone_a_cycles', state.cannabisZoneACycles),
    ha.setInputNumber('input_number.cannabis_irrigation_zone_b_cycles', state.cannabisZoneBCycles),
    ha.setInputNumber('input_number.cannabis_fertigation_ec_in', state.cannabisEcIn),
    ha.setInputNumber('input_number.cannabis_fertigation_ph_in', state.cannabisPhIn),
    ha.setInputNumber('input_number.cannabis_fertigation_dose_ml_min', state.cannabisDoseRateMlMin),
    ha.setInputNumber('input_number.cannabis_runoff_ec', state.cannabisRunoffEc),
    ha.setInputNumber('input_number.cannabis_runoff_ph', state.cannabisRunoffPh),
    ha.setInputNumber('input_number.cannabis_reclaim_quality_idx', state.cannabisReclaimQualityIdx),
    ha.setInputNumber('input_number.cannabis_dry_room_temp_f', state.cannabisDryRoomTempF),
    ha.setInputNumber('input_number.cannabis_dry_room_rh_pct', state.cannabisDryRoomRhPct),
    ha.setInputNumber('input_number.cannabis_cure_progress_pct', state.cannabisCureProgressPct),
    ha.setInputNumber('input_number.cannabis_moisture_content_pct', state.cannabisMoistureContentPct),
    ha.setInputNumber('input_number.cannabis_extraction_queue_count', state.cannabisExtractionQueueCount),
    ha.setInputNumber(
      'input_number.cannabis_packaging_throughput_units_hr',
      state.cannabisPackagingThroughputUnitsHr
    ),
    ha.setInputNumber('input_number.cannabis_line_uptime_pct', state.cannabisLineUptimePct),
    ha.setInputNumber('input_number.cannabis_qc_hold_count', state.cannabisQcHoldCount),
    ha.setInputNumber('input_number.cannabis_access_denied_events_1h', state.cannabisAccessDeniedEvents1h),
    ha.setInputNumber('input_number.cannabis_guard_coverage_pct', state.cannabisGuardCoveragePct),
    ha.setInputNumber('input_number.cannabis_staff_on_shift_total', state.cannabisStaffOnShiftTotal),
    ha.setInputNumber('input_number.cannabis_staff_cultivation', state.cannabisStaffCultivation),
    ha.setInputNumber('input_number.cannabis_staff_processing', state.cannabisStaffProcessing),
    ha.setInputNumber('input_number.cannabis_staff_security', state.cannabisStaffSecurity),
    ha.setInputNumber('input_number.cannabis_staff_logistics', state.cannabisStaffLogistics),
    ha.setInputNumber('input_number.cannabis_work_orders_open', state.cannabisWorkOrdersOpen),
    ha.setInputNumber('input_number.cannabis_work_orders_overdue', state.cannabisWorkOrdersOverdue),
    ha.setInputNumber('input_number.cannabis_schedule_adherence_pct', state.cannabisScheduleAdherencePct),
    ha.setInputNumber('input_number.cannabis_camera_health_pct', state.cannabisCameraHealthPct),
    ha.setInputNumber('input_number.cannabis_camera_alert_count', state.cannabisCameraAlertCount),
    ha.setInputNumber('input_number.cannabis_drone_progress_pct', state.cannabisDroneProgressPct),
    ha.setInputNumber('input_number.cannabis_drone_battery_pct', state.cannabisDroneBatteryPct),
    ha.setInputNumber('input_number.cannabis_drone_anomaly_score', state.cannabisDroneAnomalyScore),
    ha.setInputNumber('input_number.cannabis_transfer_eta_min', state.cannabisTransferEtaMin),
    ha.setInputNumber('input_number.cannabis_transport_risk_idx', state.cannabisTransportRiskIdx),
    ha.setInputNumber('input_number.cannabis_total_dried_flower_lbs', state.cannabisTotalDriedFlowerLbs),
    ha.setInputNumber('input_number.cannabis_total_extract_liters', state.cannabisTotalExtractLiters),
    ha.setInputNumber('input_number.cannabis_total_packaged_units', state.cannabisTotalPackagedUnits),
    ha.setInputBoolean('input_boolean.cannabis_site_a_zone_veg_irrigation', state.cannabisZoneVegIrrigation),
    ha.setInputBoolean(
      'input_boolean.cannabis_site_a_zone_flower_irrigation',
      state.cannabisZoneFlowerIrrigation
    ),
    ha.setInputBoolean(
      'input_boolean.cannabis_site_b_greenhouse_irrigation',
      state.cannabisGreenhouseIrrigation
    ),
    ha.setInputBoolean('input_boolean.cannabis_site_c_hemp_block_irrigation', state.cannabisHempBlockIrrigation),
    ha.setInputBoolean('input_boolean.cannabis_site_a_hvac_enable', state.cannabisHvacEnable),
    ha.setInputBoolean('input_boolean.cannabis_site_a_dehu_enable', state.cannabisDehuEnable),
    ha.setInputBoolean('input_boolean.cannabis_site_a_co2_inject_enable', state.cannabisCo2InjectEnable),
    ha.setInputBoolean('input_boolean.cannabis_site_a_fertigation_enable', state.cannabisFertigationEnable),
    ha.setInputBoolean(
      'input_boolean.cannabis_site_a_processing_line_enable',
      state.cannabisProcessingLineEnable
    ),
    ha.setInputBoolean(
      'input_boolean.cannabis_site_a_packaging_line_enable',
      state.cannabisPackagingLineEnable
    ),
    setIfNotManuallyChanged('input_boolean.cannabis_site_a_perimeter_lockdown', state.cannabisPerimeterLockdown),
    setIfNotManuallyChanged('input_boolean.cannabis_site_a_vault_lock', state.cannabisVaultLock),
    setIfNotManuallyChanged('input_boolean.cannabis_site_a_camera_ptz_patrol', state.cannabisCameraPtzPatrol),
    ha.setInputBoolean('input_boolean.cannabis_vault_exception_active', state.cannabisVaultExceptionActive),
    ha.setInputBoolean('input_boolean.cannabis_badge_system_degraded', state.cannabisBadgeSystemDegraded),
    ha.setInputBoolean('input_boolean.cannabis_staff_shortage_alert', state.cannabisStaffShortageAlert),
    ha.setInputBoolean(
      'input_boolean.cannabis_schedule_disruption_active',
      state.cannabisScheduleDisruptionActive
    ),
    ha.setInputBoolean('input_boolean.cannabis_drone_geofence_breach', state.cannabisDroneGeofenceBreach),
    ha.setInputBoolean('input_boolean.cannabis_camera_link_degraded', state.cannabisCameraLinkDegraded),
    ha.setInputBoolean('input_boolean.cannabis_processing_line_fault', state.cannabisProcessingLineFault),
    ha.setInputBoolean('input_boolean.cannabis_hvac_alarm', state.cannabisHvacAlarm),
    ha.setInputBoolean('input_boolean.cannabis_dehu_alarm', state.cannabisDehuAlarm),
    ha.setInputBoolean('input_boolean.cannabis_fertigation_alarm', state.cannabisFertigationAlarm),
    ha.setInputBoolean('input_boolean.cannabis_transport_delay', state.cannabisTransportDelay),
    ha.setInputBoolean('input_boolean.cannabis_security_intrusion', state.cannabisSecurityIntrusion),
    setIfNotManuallyChanged('input_select.cannabis_shift_mode', state.cannabisShiftMode),
    setIfNotManuallyChanged('input_select.cannabis_site_focus', state.cannabisSiteFocus),
    setIfNotManuallyChanged('input_select.cannabis_security_posture', state.cannabisSecurityPosture),
    setIfNotManuallyChanged('input_select.cannabis_drone_mission_state', state.cannabisDroneMissionState),
    setIfNotManuallyChanged('input_select.cannabis_scenario', state.cannabisScenario),
    setIfNotManuallyChanged('input_select.cannabis_env_recipe', state.cannabisEnvRecipe),
    setIfNotManuallyChanged('input_select.cannabis_control_profile', state.cannabisControlProfile),
    ha.setInputText('input_text.cannabis_shift_supervisor', state.cannabisShiftSupervisor),
    ha.setInputText('input_text.cannabis_next_critical_task', state.cannabisNextCriticalTask),
    ha.setInputText('input_text.cannabis_dispatch_channel_status', state.cannabisDispatchChannelStatus),
    ha.setInputText('input_text.cannabis_browser_ops_primary_url', state.cannabisBrowserOpsPrimaryUrl),
    ha.setInputText(
      'input_text.cannabis_browser_ops_secondary_url',
      state.cannabisBrowserOpsSecondaryUrl
    ),
    ha.setInputText('input_text.cannabis_manifest_live_id', state.cannabisManifestLiveId),

    // Grow room tracking
    setIfNotManuallyChanged('input_select.cannabis_room_a_stage', state.cannabisRoomAStage),
    setIfNotManuallyChanged('input_select.cannabis_room_b_stage', state.cannabisRoomBStage),
    setIfNotManuallyChanged('input_select.cannabis_room_c_stage', state.cannabisRoomCStage),
    setIfNotManuallyChanged('input_select.cannabis_room_d_stage', state.cannabisRoomDStage),
    ha.setInputNumber('input_number.cannabis_room_a_days_in_stage', state.cannabisRoomADaysInStage),
    ha.setInputNumber('input_number.cannabis_room_b_days_in_stage', state.cannabisRoomBDaysInStage),
    ha.setInputNumber('input_number.cannabis_room_c_days_in_stage', state.cannabisRoomCDaysInStage),
    ha.setInputNumber('input_number.cannabis_room_d_days_in_stage', state.cannabisRoomDDaysInStage),

    // IPM
    ha.setInputNumber('input_number.cannabis_ipm_pest_pressure_room_a', state.cannabisIpmPestPressureRoomA),
    ha.setInputNumber('input_number.cannabis_ipm_pest_pressure_room_b', state.cannabisIpmPestPressureRoomB),
    ha.setInputNumber('input_number.cannabis_ipm_pest_pressure_room_c', state.cannabisIpmPestPressureRoomC),
    ha.setInputNumber('input_number.cannabis_ipm_pest_pressure_room_d', state.cannabisIpmPestPressureRoomD),
    ha.setInputNumber('input_number.cannabis_ipm_days_since_spray_room_a', state.cannabisIpmDaysSinceSprayRoomA),
    ha.setInputNumber('input_number.cannabis_ipm_days_since_spray_room_b', state.cannabisIpmDaysSinceSprayRoomB),
    ha.setInputNumber('input_number.cannabis_ipm_days_since_spray_room_c', state.cannabisIpmDaysSinceSprayRoomC),
    ha.setInputNumber('input_number.cannabis_ipm_days_since_spray_room_d', state.cannabisIpmDaysSinceSprayRoomD),
    ha.setInputBoolean('input_boolean.cannabis_ipm_scouting_due_room_a', state.cannabisIpmScoutingDueRoomA),
    ha.setInputBoolean('input_boolean.cannabis_ipm_scouting_due_room_b', state.cannabisIpmScoutingDueRoomB),
    ha.setInputBoolean('input_boolean.cannabis_ipm_scouting_due_room_c', state.cannabisIpmScoutingDueRoomC),
    ha.setInputBoolean('input_boolean.cannabis_ipm_scouting_due_room_d', state.cannabisIpmScoutingDueRoomD),

    // Lab
    ha.setInputBoolean('input_boolean.cannabis_lab_extraction_active', state.cannabisLabExtractionActive),
    ha.setInputBoolean('input_boolean.cannabis_lab_safety_interlock_ok', state.cannabisLabSafetyInterlockOk),
    ha.setInputBoolean('input_boolean.cannabis_lab_ppe_compliance_active', state.cannabisLabPpeComplianceActive),
    ha.setInputBoolean('input_boolean.cannabis_lab_solvent_alarm', state.cannabisLabSolventAlarm),
    ha.setInputNumber('input_number.cannabis_lab_batch_queue_count', state.cannabisLabBatchQueueCount),
    ha.setInputNumber('input_number.cannabis_lab_extraction_yield_pct', state.cannabisLabExtractionYieldPct),
    ha.setInputNumber('input_number.cannabis_lab_solvent_recovery_pct', state.cannabisLabSolventRecoveryPct),
    ha.setInputNumber('input_number.cannabis_lab_active_batch_duration_hrs', state.cannabisLabActiveBatchDurationHrs),
    ha.setInputNumber('input_number.cannabis_lab_room_temp_f', state.cannabisLabRoomTempF),
    ha.setInputNumber('input_number.cannabis_lab_room_rh_pct', state.cannabisLabRoomRhPct),
    ha.setInputNumber('input_number.cannabis_lab_ventilation_pct', state.cannabisLabVentilationPct),
    ha.setInputNumber('input_number.cannabis_lab_distillate_liters', state.cannabisLabDistillateLiters),

    // Dispensary
    ha.setInputBoolean('input_boolean.cannabis_dispensary_pos_online', state.cannabisDispensaryPosOnline),
    ha.setInputBoolean('input_boolean.cannabis_dispensary_metrc_pos_sync_ok', state.cannabisDispensaryMetrcPosSyncOk),
    ha.setInputBoolean('input_boolean.cannabis_dispensary_low_inventory_alert', state.cannabisDispensaryLowInventoryAlert),
    ha.setInputNumber('input_number.cannabis_dispensary_daily_sales_usd', state.cannabisDispensaryDailySalesUsd),
    ha.setInputNumber('input_number.cannabis_dispensary_transaction_count', state.cannabisDispensaryTransactionCount),
    ha.setInputNumber('input_number.cannabis_dispensary_avg_basket_usd', state.cannabisDispensaryAvgBasketUsd),
    ha.setInputNumber('input_number.cannabis_dispensary_patient_count_today', state.cannabisDispensaryPatientCountToday),
    ha.setInputNumber('input_number.cannabis_dispensary_flower_inventory_grams', state.cannabisDispensaryFlowerInventoryGrams),
    ha.setInputNumber('input_number.cannabis_dispensary_extract_inventory_grams', state.cannabisDispensaryExtractInventoryGrams),

    // Financial
    ha.setInputNumber('input_number.cannabis_financial_cost_per_gram_flower', state.cannabisFinancialCostPerGramFlower),
    ha.setInputNumber('input_number.cannabis_financial_labor_cost_today', state.cannabisFinancialLaborCostToday),
    ha.setInputNumber('input_number.cannabis_financial_energy_cost_today', state.cannabisFinancialEnergyCostToday),
    ha.setInputNumber('input_number.cannabis_financial_gross_margin_pct', state.cannabisFinancialGrossMarginPct),

    ...incidentActions,
  ]);

  const failures = writeResults.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failures.length > 0) {
    console.warn(`⚠️ Telemetry write partial failure (${failures.length}/${writeResults.length})`);
    for (const failure of failures.slice(0, 3)) {
      const detail =
        failure.reason instanceof Error
          ? failure.reason.message
          : typeof failure.reason === 'string'
            ? failure.reason
            : JSON.stringify(failure.reason);
      console.warn(`   ↳ ${detail}`);
    }
    if (failures.length > 3) {
      console.warn(`   ↳ ... ${failures.length - 3} additional write errors`);
    }
  }

  if (incidentMode === 'normal') {
    await runAgentActions(ha, states);
  }
}

async function runSimulation() {
  loadDotEnv();
  const tickIntervalMs = getTickIntervalMs();
  const profileSwitchEveryTicks = getProfileSwitchEveryTicks();
  let activeProfile = normalizeProfile(process.env.SIM_FARM_PROFILE);

  console.log('🌿 Starting Full-Spectrum Cannabis Ops Telemetry + Agent Action Simulation...');
  console.log(`   Tick interval: ${tickIntervalMs}ms`);
  console.log(`   Profile: ${activeProfile}`);
  if (profileSwitchEveryTicks > 0) {
    console.log(`   Profile rotation: every ${profileSwitchEveryTicks} ticks`);
  }
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
  // Track entities that were manually changed to prevent simulator override during demos
  const manualChanges = new Map<string, number>(); // entity_id -> timestamp of last manual change

  const isEntityRecentlyManuallyChanged = async (
    entityId: string,
    gracePeriodMs: number = 5000
  ): Promise<boolean> => {
    try {
      const response = await fetch(
        `${process.env.HA_URL}/api/states/${entityId}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.HA_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!response.ok) return false;

      const data = (await response.json()) as { last_changed?: string };
      if (!data.last_changed) return false;

      const lastChangedTime = new Date(data.last_changed).getTime();
      const timeSinceChange = Date.now() - lastChangedTime;

      // If changed recently and not by the simulator, it's a manual change
      return timeSinceChange < gracePeriodMs;
    } catch {
      return false;
    }
  };

  const tick = async () => {
    try {
      const currentState = await getCurrentState(ha);
      if (profileSwitchEveryTicks > 0 && iteration > 0 && iteration % profileSwitchEveryTicks === 0) {
        activeProfile = pickNextProfile(activeProfile);
        console.log(`[${new Date().toISOString()}] Switched simulation profile -> ${activeProfile}`);
      }

      await updateState(ha, currentState, activeProfile, manualChanges, isEntityRecentlyManuallyChanged);

      iteration++;
      if (iteration % 12 === 0) {
        console.log(
          `[${new Date().toISOString()}] Ops Update:`,
          `Profile: ${activeProfile}`,
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
