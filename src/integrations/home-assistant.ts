import { z } from 'zod';

const HA_ENTITY_SCHEMA = z.object({
  entity_id: z.string(),
  state: z.string(),
  attributes: z.record(z.any()).optional(),
  last_changed: z.string().optional(),
  last_updated: z.string().optional(),
});

const HA_STATE_RESPONSE = z.array(HA_ENTITY_SCHEMA);

export interface CannabisStaffByFunction {
  cultivation: number;
  processing: number;
  security: number;
  logistics: number;
}

export interface CannabisOpsStatus {
  env: {
    air_temp_f: number;
    leaf_temp_f: number;
    rh_pct: number;
    co2_ppm: number;
    ppfd: number;
    dli: number;
    vpd_kpa: number;
    dewpoint_f: number;
    hvac_load_pct: number;
    dehu_load_pct: number;
  };
  irrigation_fertigation: {
    zone_cycles: number;
    ec_in: number;
    ph_in: number;
    dose_rate_ml_min: number;
    runoff_ec: number;
    runoff_ph: number;
    reclaim_quality_idx: number;
  };
  post_harvest: {
    dry_room_temp_f: number;
    dry_room_rh_pct: number;
    cure_progress_pct: number;
    moisture_content_pct: number;
  };
  processing_packaging: {
    extraction_queue_count: number;
    packaging_throughput_units_hr: number;
    line_uptime_pct: number;
    qc_hold_count: number;
  };
  security_access: {
    access_denied_events_1h: number;
    guard_coverage_pct: number;
    vault_exception_active: boolean;
    security_escalation_required: boolean;
  };
  workforce_schedule: {
    staff_on_shift_total: number;
    staff_by_function: CannabisStaffByFunction;
    work_orders_open: number;
    work_orders_overdue: number;
    schedule_adherence_pct: number;
    shift_mode: string;
    site_focus: string;
    next_critical_task: string;
  };
  video_drone: {
    camera_health_pct: number;
    camera_alert_count: number;
    drone_mission_state: string;
    drone_progress_pct: number;
    drone_battery_pct: number;
    drone_anomaly_score: number;
    drone_geofence_breach: boolean;
  };
}

export interface FarmStatus {
  // Weather
  outdoorTempAvg: number;
  windSpeed: number;
  windDirection: string;
  barometricPressure: number;
  rainfallToday: number;
  frostRisk: boolean;
  heatWarning: boolean;
  highWindAlert: boolean;
  rainDetected: boolean;
  stormAlert: boolean;
  
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
  waterTankMain: number;
  waterTankSecondary: number;
  waterTankNursery: number;
  waterTankTotal: number;
  well1Level: number;
  well2Level: number;
  pondLevel: number;
  rainwaterCollection: number;
  
  // Power
  solarGeneration: number;
  gridConsumption: number;
  batteryLevel: number;
  generatorFuel: number;
  
  // Livestock
  cattleCount: number;
  chickenCount: number;
  barnTemp: number;
  barnHumidity: number;
  feedSiloLevel: number;
  
  // Equipment
  tractorFuel: number;
  harvesterFuel: number;
  truck1Fuel: number;
  truck2Fuel: number;
  
  // Yields
  grainYield: number;
  vegetableYield: number;
  fruitYield: number;
  eggsToday: number;
  milkToday: number;
  
  // System Status
  irrigationActive: boolean;
  pumpsRunning: boolean;

  // Compliance + Traceability (licensed cannabis/hemp demo)
  complianceOpenItems: number;
  auditCompletenessPct: number;
  transferQueueCount: number;
  qaReleaseReadiness: number;
  metrcSyncHealth: number;
  custodyBreakRisk: number;
  transferStatus: string;
  qaHoldActive: boolean;
  recallReadiness: boolean;
  lastManifestId: string;
  lastPackageTag: string;
  lastPlantBatchTag: string;
  lastCoaId: string;

  // Cannabis enterprise digital twin status groups
  env: CannabisOpsStatus['env'];
  irrigation_fertigation: CannabisOpsStatus['irrigation_fertigation'];
  post_harvest: CannabisOpsStatus['post_harvest'];
  processing_packaging: CannabisOpsStatus['processing_packaging'];
  security_access: CannabisOpsStatus['security_access'];
  workforce_schedule: CannabisOpsStatus['workforce_schedule'];
  video_drone: CannabisOpsStatus['video_drone'];
}

export class HomeAssistantAdapter {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  async getAllStates() {
    const response = await fetch(`${this.baseUrl}/api/states`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to get states: ${response.status} ${response.statusText}`);
    }
    return HA_STATE_RESPONSE.parse(await response.json());
  }

  async getState(entityId: string) {
    const response = await fetch(`${this.baseUrl}/api/states/${entityId}`, {
      headers: this.getHeaders(),
    });
    if (!response.ok) {
      throw new Error(`Failed to get state for ${entityId}: ${response.status} ${response.statusText}`);
    }
    return HA_ENTITY_SCHEMA.parse(await response.json());
  }

  async callService(domain: string, service: string, data?: Record<string, any>) {
    const response = await fetch(`${this.baseUrl}/api/services/${domain}/${service}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(data || {}),
    });
    if (!response.ok) {
      throw new Error(`Service call ${domain}.${service} failed: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  async setInputNumber(entityId: string, value: number) {
    return this.callService('input_number', 'set_value', {
      entity_id: entityId,
      value: value,
    });
  }

  async setSwitch(entityId: string, on: boolean) {
    return this.callService('switch', on ? 'turn_on' : 'turn_off', {
      entity_id: entityId,
    });
  }

  async setInputBoolean(entityId: string, on: boolean) {
    return this.callService('input_boolean', on ? 'turn_on' : 'turn_off', {
      entity_id: entityId,
    });
  }

  async setInputText(entityId: string, value: string) {
    return this.callService('input_text', 'set_value', {
      entity_id: entityId,
      value,
    });
  }

  async setInputSelect(entityId: string, option: string) {
    return this.callService('input_select', 'select_option', {
      entity_id: entityId,
      option,
    });
  }

  async setCannabisControlProfile(profile: string) {
    return this.setInputSelect('input_select.cannabis_control_profile', profile);
  }

  async setOpsUrlTarget(target: 'primary' | 'secondary', url: string) {
    const entityId =
      target === 'secondary'
        ? 'input_text.cannabis_browser_ops_secondary_url'
        : 'input_text.cannabis_browser_ops_primary_url';
    return this.setInputText(entityId, url);
  }

  // === IRRIGATION CONTROLS ===
  async turnOnIrrigation(zone: string): Promise<void> {
    const entityMap: Record<string, string> = {
      north: 'switch.irrigation_north',
      south: 'switch.irrigation_south',
      west: 'switch.irrigation_west_pasture',
      east: 'switch.irrigation_east_orchard',
      vegetable: 'switch.irrigation_vegetable',
      nursery: 'switch.irrigation_nursery',
    };
    const entity = entityMap[zone];
    if (entity) {
      await this.callService('switch', 'turn_on', { entity_id: entity });
    }
  }

  async turnOffIrrigation(zone: string): Promise<void> {
    const entityMap: Record<string, string> = {
      north: 'switch.irrigation_north',
      south: 'switch.irrigation_south',
      west: 'switch.irrigation_west_pasture',
      east: 'switch.irrigation_east_orchard',
      vegetable: 'switch.irrigation_vegetable',
      nursery: 'switch.irrigation_nursery',
    };
    const entity = entityMap[zone];
    if (entity) {
      await this.callService('switch', 'turn_off', { entity_id: entity });
    }
  }

  // === PUMP CONTROLS ===
  async turnOnPump(pump: string): Promise<void> {
    const entityMap: Record<string, string> = {
      well1: 'switch.pump_well_1',
      well2: 'switch.pump_well_2',
      main: 'switch.pump_main',
    };
    const entity = entityMap[pump];
    if (entity) {
      await this.callService('switch', 'turn_on', { entity_id: entity });
    }
  }

  async turnOffPump(pump: string): Promise<void> {
    const entityMap: Record<string, string> = {
      well1: 'switch.pump_well_1',
      well2: 'switch.pump_well_2',
      main: 'switch.pump_main',
    };
    const entity = entityMap[pump];
    if (entity) {
      await this.callService('switch', 'turn_off', { entity_id: entity });
    }
  }

  // === GREENHOUSE CONTROLS ===
  async setGreenhouseTemp(section: string, temp: number): Promise<void> {
    const entityMap: Record<string, string> = {
      a: 'input_number.greenhouse_temp_section_a',
      b: 'input_number.greenhouse_temp_section_b',
      c: 'input_number.greenhouse_temp_section_c',
    };
    const entity = entityMap[section];
    if (entity) {
      await this.setInputNumber(entity, temp);
    }
  }

  async setGreenhouseHumidity(section: string, humidity: number): Promise<void> {
    const entityMap: Record<string, string> = {
      a: 'input_number.greenhouse_humidity_a',
      b: 'input_number.greenhouse_humidity_b',
      c: 'input_number.greenhouse_humidity_c',
    };
    const entity = entityMap[section];
    if (entity) {
      await this.setInputNumber(entity, humidity);
    }
  }

  async setSoilMoisture(field: string, moisture: number): Promise<void> {
    const entityMap: Record<string, string> = {
      north: 'input_number.soil_moisture_north_field',
      south: 'input_number.soil_moisture_south_field',
      west: 'input_number.soil_moisture_west_pasture',
      east: 'input_number.soil_moisture_east_orchard',
      vegetable: 'input_number.soil_moisture_vegetable_field',
      nursery: 'input_number.soil_moisture_nursery',
    };
    const entity = entityMap[field];
    if (entity) {
      await this.setInputNumber(entity, moisture);
    }
  }

  async getFarmStatus(): Promise<FarmStatus> {
    const states = await this.getAllStates();
    const getValue = (entityId: string, defaultVal: string | number = 'unknown'): string | number => {
      const entity = states.find(e => e.entity_id === entityId);
      return entity ? entity.state : defaultVal;
    };

    return {
      // Weather
      outdoorTempAvg: parseFloat(getValue('sensor.outdoor_temp_avg', 58) as string) || 58,
      windSpeed: parseFloat(getValue('input_number.wind_speed', 12) as string) || 12,
      windDirection: getValue('sensor.wind_direction_cardinal', 'N') as string,
      barometricPressure: parseFloat(getValue('input_number.barometric_pressure', 30.1) as string) || 30.1,
      rainfallToday: parseFloat(getValue('input_number.rainfall_today', 0) as string) || 0,
      frostRisk: getValue('binary_sensor.frost_risk') === 'on',
      heatWarning: getValue('binary_sensor.heat_warning') === 'on',
      highWindAlert: getValue('binary_sensor.high_wind_alert') === 'on',
      rainDetected: getValue('binary_sensor.rain_detected') === 'on',
      stormAlert: getValue('binary_sensor.storm_alert') === 'on',
      
      // Soil Moisture
      soilMoistureNorth: parseFloat(getValue('input_number.soil_moisture_north_field', 45) as string) || 45,
      soilMoistureSouth: parseFloat(getValue('input_number.soil_moisture_south_field', 52) as string) || 52,
      soilMoistureWest: parseFloat(getValue('input_number.soil_moisture_west_pasture', 38) as string) || 38,
      soilMoistureEast: parseFloat(getValue('input_number.soil_moisture_east_orchard', 55) as string) || 55,
      soilMoistureVegetable: parseFloat(getValue('input_number.soil_moisture_vegetable_field', 62) as string) || 62,
      soilMoistureNursery: parseFloat(getValue('input_number.soil_moisture_nursery', 70) as string) || 70,
      
      // Greenhouse
      greenhouseTempA: parseFloat(getValue('input_number.greenhouse_temp_section_a', 72) as string) || 72,
      greenhouseTempB: parseFloat(getValue('input_number.greenhouse_temp_section_b', 68) as string) || 68,
      greenhouseTempC: parseFloat(getValue('input_number.greenhouse_temp_section_c', 75) as string) || 75,
      greenhouseHumidityA: parseFloat(getValue('input_number.greenhouse_humidity_a', 65) as string) || 65,
      greenhouseHumidityB: parseFloat(getValue('input_number.greenhouse_humidity_b', 72) as string) || 72,
      greenhouseHumidityC: parseFloat(getValue('input_number.greenhouse_humidity_c', 58) as string) || 58,
      
      // Water
      waterTankMain: parseFloat(getValue('input_number.tank_level_main', 75000) as string) || 75000,
      waterTankSecondary: parseFloat(getValue('input_number.tank_level_secondary', 35000) as string) || 35000,
      waterTankNursery: parseFloat(getValue('input_number.tank_level_nursery', 4200) as string) || 4200,
      waterTankTotal: parseFloat(getValue('sensor.water_tank_total', 114200) as string) || 114200,
      well1Level: parseFloat(getValue('input_number.well_1_level', 78) as string) || 78,
      well2Level: parseFloat(getValue('input_number.well_2_level', 82) as string) || 82,
      pondLevel: parseFloat(getValue('input_number.pond_level', 65) as string) || 65,
      rainwaterCollection: parseFloat(getValue('input_number.rainwater_collection', 2500) as string) || 2500,
      
      // Power
      solarGeneration: parseFloat(getValue('input_number.solar_generation_kw', 125) as string) || 125,
      gridConsumption: parseFloat(getValue('input_number.grid_power_consumption', 45) as string) || 45,
      batteryLevel: parseFloat(getValue('input_number.battery_storage_pct', 85) as string) || 85,
      generatorFuel: parseFloat(getValue('input_number.generator_fuel_level', 92) as string) || 92,
      
      // Livestock
      cattleCount: parseFloat(getValue('input_number.cattle_count', 48) as string) || 48,
      chickenCount: parseFloat(getValue('input_number.chicken_count', 142) as string) || 142,
      barnTemp: parseFloat(getValue('input_number.barn_temp', 55) as string) || 55,
      barnHumidity: parseFloat(getValue('input_number.barn_humidity', 62) as string) || 62,
      feedSiloLevel: parseFloat(getValue('input_number.feed_silo_level', 72) as string) || 72,
      
      // Equipment
      tractorFuel: parseFloat(getValue('input_number.tractor_fuel', 65) as string) || 65,
      harvesterFuel: parseFloat(getValue('input_number.harvester_fuel', 82) as string) || 82,
      truck1Fuel: parseFloat(getValue('input_number.truck_fuel_1', 45) as string) || 45,
      truck2Fuel: parseFloat(getValue('input_number.truck_fuel_2', 58) as string) || 58,
      
      // Yields
      grainYield: parseFloat(getValue('input_number.yield_grain_current', 15250) as string) || 15250,
      vegetableYield: parseFloat(getValue('input_number.yield_vegetables_current', 8750) as string) || 8750,
      fruitYield: parseFloat(getValue('input_number.yield_fruit_current', 4200) as string) || 4200,
      eggsToday: parseFloat(getValue('input_number.eggs_today', 0) as string) || 0,
      milkToday: parseFloat(getValue('input_number.milk_today', 0) as string) || 0,
      
      // System Status
      irrigationActive: getValue('binary_sensor.irrigation_active') === 'on',
      pumpsRunning: getValue('binary_sensor.pumps_running') === 'on',

      // Compliance + Traceability
      complianceOpenItems: parseFloat(getValue('sensor.compliance_open_items', 0) as string) || 0,
      auditCompletenessPct: parseFloat(getValue('sensor.audit_completeness_pct', 92) as string) || 92,
      transferQueueCount: parseFloat(getValue('sensor.transfer_queue_count', 2) as string) || 2,
      qaReleaseReadiness: parseFloat(getValue('sensor.qa_release_readiness', 88) as string) || 88,
      metrcSyncHealth: parseFloat(getValue('sensor.metrc_sync_health', 95) as string) || 95,
      custodyBreakRisk: parseFloat(getValue('sensor.custody_break_risk', 6) as string) || 6,
      transferStatus: getValue('input_select.transfer_status', 'Ready') as string,
      qaHoldActive: getValue('input_boolean.qa_hold_active') === 'on',
      recallReadiness: getValue('input_boolean.recall_readiness') === 'on',
      lastManifestId: getValue('input_text.metrc_manifest_id', 'MANIFEST-PENDING') as string,
      lastPackageTag: getValue('input_text.metrc_last_package_tag', 'PKG-PENDING') as string,
      lastPlantBatchTag: getValue('input_text.metrc_last_plant_batch_tag', 'PLANT-PENDING') as string,
      lastCoaId: getValue('input_text.metrc_last_coa_id', 'COA-PENDING') as string,

      env: {
        air_temp_f: parseFloat(getValue('sensor.cannabis_air_temp_f', 76) as string) || 76,
        leaf_temp_f: parseFloat(getValue('sensor.cannabis_leaf_temp_f', 74) as string) || 74,
        rh_pct: parseFloat(getValue('sensor.cannabis_rh_pct', 57) as string) || 57,
        co2_ppm: parseFloat(getValue('sensor.cannabis_co2_ppm', 1050) as string) || 1050,
        ppfd: parseFloat(getValue('sensor.cannabis_ppfd', 850) as string) || 850,
        dli: parseFloat(getValue('sensor.cannabis_dli', 38) as string) || 38,
        vpd_kpa: parseFloat(getValue('sensor.cannabis_env_vpd_kpa', 0.92) as string) || 0.92,
        dewpoint_f: parseFloat(getValue('sensor.cannabis_dewpoint_f', 67) as string) || 67,
        hvac_load_pct: parseFloat(getValue('sensor.cannabis_hvac_load_pct', 62) as string) || 62,
        dehu_load_pct: parseFloat(getValue('sensor.cannabis_dehu_load_pct', 54) as string) || 54,
      },
      irrigation_fertigation: {
        zone_cycles: parseFloat(getValue('sensor.cannabis_zone_cycles', 33) as string) || 33,
        ec_in: parseFloat(getValue('sensor.cannabis_ec_in', 2.1) as string) || 2.1,
        ph_in: parseFloat(getValue('sensor.cannabis_ph_in', 5.9) as string) || 5.9,
        dose_rate_ml_min: parseFloat(getValue('sensor.cannabis_dose_rate_ml_min', 145) as string) || 145,
        runoff_ec: parseFloat(getValue('sensor.cannabis_runoff_ec', 2.3) as string) || 2.3,
        runoff_ph: parseFloat(getValue('sensor.cannabis_runoff_ph', 6.1) as string) || 6.1,
        reclaim_quality_idx: parseFloat(getValue('sensor.cannabis_reclaim_quality_idx', 86) as string) || 86,
      },
      post_harvest: {
        dry_room_temp_f: parseFloat(getValue('sensor.cannabis_dry_room_temp_f', 63) as string) || 63,
        dry_room_rh_pct: parseFloat(getValue('sensor.cannabis_dry_room_rh_pct', 57) as string) || 57,
        cure_progress_pct: parseFloat(getValue('sensor.cannabis_cure_progress_pct', 42) as string) || 42,
        moisture_content_pct: parseFloat(getValue('sensor.cannabis_moisture_content_pct', 11.8) as string) || 11.8,
      },
      processing_packaging: {
        extraction_queue_count: parseFloat(getValue('sensor.cannabis_extraction_queue_count', 64) as string) || 64,
        packaging_throughput_units_hr: parseFloat(getValue('sensor.cannabis_packaging_throughput_units_hr', 1420) as string) || 1420,
        line_uptime_pct: parseFloat(getValue('sensor.cannabis_line_uptime_pct', 91) as string) || 91,
        qc_hold_count: parseFloat(getValue('sensor.cannabis_qc_hold_count', 7) as string) || 7,
      },
      security_access: {
        access_denied_events_1h: parseFloat(getValue('sensor.cannabis_access_denied_events_1h', 3) as string) || 3,
        guard_coverage_pct: parseFloat(getValue('sensor.cannabis_guard_coverage_pct', 94) as string) || 94,
        vault_exception_active: getValue('input_boolean.cannabis_vault_exception_active') === 'on',
        security_escalation_required: getValue('binary_sensor.cannabis_security_escalation_required') === 'on',
      },
      workforce_schedule: {
        staff_on_shift_total: parseFloat(getValue('sensor.cannabis_staff_on_shift_total', 96) as string) || 96,
        staff_by_function: {
          cultivation: parseFloat(getValue('input_number.cannabis_staff_cultivation', 44) as string) || 44,
          processing: parseFloat(getValue('input_number.cannabis_staff_processing', 24) as string) || 24,
          security: parseFloat(getValue('input_number.cannabis_staff_security', 14) as string) || 14,
          logistics: parseFloat(getValue('input_number.cannabis_staff_logistics', 14) as string) || 14,
        },
        work_orders_open: parseFloat(getValue('sensor.cannabis_work_orders_open', 38) as string) || 38,
        work_orders_overdue: parseFloat(getValue('sensor.cannabis_work_orders_overdue', 4) as string) || 4,
        schedule_adherence_pct: parseFloat(getValue('sensor.cannabis_schedule_adherence_pct', 93) as string) || 93,
        shift_mode: getValue('input_select.cannabis_shift_mode', 'Day') as string,
        site_focus: getValue('input_select.cannabis_site_focus', 'Site A Indoor') as string,
        next_critical_task: getValue('input_text.cannabis_next_critical_task', 'Review daily operations board') as string,
      },
      video_drone: {
        camera_health_pct: parseFloat(getValue('sensor.cannabis_camera_health_pct', 96) as string) || 96,
        camera_alert_count: parseFloat(getValue('sensor.cannabis_camera_alert_count', 2) as string) || 2,
        drone_mission_state: getValue('input_select.cannabis_drone_mission_state', 'Idle') as string,
        drone_progress_pct: parseFloat(getValue('sensor.cannabis_drone_progress_pct', 0) as string) || 0,
        drone_battery_pct: parseFloat(getValue('sensor.cannabis_drone_battery_pct', 88) as string) || 88,
        drone_anomaly_score: parseFloat(getValue('sensor.cannabis_drone_anomaly_score', 5) as string) || 5,
        drone_geofence_breach: getValue('binary_sensor.cannabis_drone_geofence_breach_active') === 'on',
      },
    };
  }

  async getCannabisOpsStatus(): Promise<CannabisOpsStatus> {
    const status = await this.getFarmStatus();
    return {
      env: status.env,
      irrigation_fertigation: status.irrigation_fertigation,
      post_harvest: status.post_harvest,
      processing_packaging: status.processing_packaging,
      security_access: status.security_access,
      workforce_schedule: status.workforce_schedule,
      video_drone: status.video_drone,
    };
  }

  formatFarmStatus(status: FarmStatus): string {
    return `
🌿 CANNABIS OPS STATUS REPORT
═══════════════════════════════════════════════════════

🌡️ WEATHER
───────────────────────────────────────────────────────
• Temperature: ${status.outdoorTempAvg}°F
• Wind: ${status.windSpeed} mph (${status.windDirection})
• Pressure: ${status.barometricPressure} inHg
• Rainfall Today: ${status.rainfallToday} in
• Alerts: ${[
  status.frostRisk ? 'FROST' : '',
  status.heatWarning ? 'HEAT' : '',
  status.highWindAlert ? 'HIGH WIND' : '',
  status.rainDetected ? 'RAIN' : '',
  status.stormAlert ? 'STORM' : ''
].filter(Boolean).join(', ') || 'None'}

💧 SOIL MOISTURE
───────────────────────────────────────────────────────
• North Field: ${status.soilMoistureNorth}%
• South Field: ${status.soilMoistureSouth}%
• West Pasture: ${status.soilMoistureWest}%
• East Orchard: ${status.soilMoistureEast}%
• Vegetable Field: ${status.soilMoistureVegetable}%
• Nursery: ${status.soilMoistureNursery}%

🌡️ GREENHOUSE
───────────────────────────────────────────────────────
• Section A: ${status.greenhouseTempA}°F / ${status.greenhouseHumidityA}%
• Section B: ${status.greenhouseTempB}°F / ${status.greenhouseHumidityB}%
• Section C: ${status.greenhouseTempC}°F / ${status.greenhouseHumidityC}%

💦 WATER STORAGE
───────────────────────────────────────────────────────
• Main Reservoir: ${status.waterTankMain.toLocaleString()} gal
• Secondary Tank: ${status.waterTankSecondary.toLocaleString()} gal
• Nursery Tank: ${status.waterTankNursery.toLocaleString()} gal
• TOTAL: ${status.waterTankTotal.toLocaleString()} gal
• Wells: ${status.well1Level}% / ${status.well2Level}%
• Pond: ${status.pondLevel}%
• Rainwater: ${status.rainwaterCollection.toLocaleString()} gal

⚡ POWER & ENERGY
───────────────────────────────────────────────────────
• Solar Generation: ${status.solarGeneration} kW
• Grid Consumption: ${status.gridConsumption} kW
• Battery: ${status.batteryLevel}%
• Generator Fuel: ${status.generatorFuel}%

🏭 POST-HARVEST + PACKAGING
───────────────────────────────────────────────────────
• Dry Room: ${status.post_harvest.dry_room_temp_f}°F / ${status.post_harvest.dry_room_rh_pct}%
• Cure Progress: ${status.post_harvest.cure_progress_pct}%
• Moisture Content: ${status.post_harvest.moisture_content_pct}%
• Packaging Throughput: ${status.processing_packaging.packaging_throughput_units_hr} units/hr

🔒 SECURITY + ACCESS
───────────────────────────────────────────────────────
• Access Denied (1h): ${status.security_access.access_denied_events_1h}
• Guard Coverage: ${status.security_access.guard_coverage_pct}%
• Vault Exception: ${status.security_access.vault_exception_active ? 'ON' : 'OFF'}
• Escalation Required: ${status.security_access.security_escalation_required ? 'YES' : 'NO'}

👥 WORKFORCE + SCHEDULE
───────────────────────────────────────────────────────
• Staff On Shift: ${status.workforce_schedule.staff_on_shift_total}
• Work Orders Open / Overdue: ${status.workforce_schedule.work_orders_open} / ${status.workforce_schedule.work_orders_overdue}
• Schedule Adherence: ${status.workforce_schedule.schedule_adherence_pct}%
• Shift Mode: ${status.workforce_schedule.shift_mode}
• Site Focus: ${status.workforce_schedule.site_focus}

📹 CAMERA + DRONE
───────────────────────────────────────────────────────
• Camera Health: ${status.video_drone.camera_health_pct}%
• Camera Alerts: ${status.video_drone.camera_alert_count}
• Drone Mission: ${status.video_drone.drone_mission_state}
• Drone Progress: ${status.video_drone.drone_progress_pct}%
• Drone Battery: ${status.video_drone.drone_battery_pct}%
• Drone Anomaly: ${status.video_drone.drone_anomaly_score}%

📋 COMPLIANCE + CHAIN OF CUSTODY
───────────────────────────────────────────────────────
• Open Items: ${status.complianceOpenItems}
• Audit Completeness: ${status.auditCompletenessPct}%
• Transfer Queue: ${status.transferQueueCount}
• QA Readiness: ${status.qaReleaseReadiness}%
• METRC Sync Health: ${status.metrcSyncHealth}%
• Custody Break Risk: ${status.custodyBreakRisk}%
• Transfer Status: ${status.transferStatus}
• QA Hold: ${status.qaHoldActive ? 'ON' : 'OFF'}
• Recall Ready: ${status.recallReadiness ? 'YES' : 'NO'}
• Last Manifest: ${status.lastManifestId}
• Last Package: ${status.lastPackageTag}
• Last Plant Batch: ${status.lastPlantBatchTag}
• Last COA: ${status.lastCoaId}

═══════════════════════════════════════════════════════
`.trim();
  }

  formatCompactStatus(status: FarmStatus): string {
    return `
🌿 CANNABIS OPS QUICK STATUS
─────────────────────────────────
🌡️ Air ${status.env.air_temp_f}°F | RH ${status.env.rh_pct}% | VPD ${status.env.vpd_kpa} kPa
💧 EC ${status.irrigation_fertigation.ec_in} | pH ${status.irrigation_fertigation.ph_in}
⚡ HVAC ${status.env.hvac_load_pct}% | Dehu ${status.env.dehu_load_pct}%
🔒 Access ${status.security_access.access_denied_events_1h}/h | Coverage ${status.security_access.guard_coverage_pct}%
👥 Shift ${status.workforce_schedule.shift_mode} | WO ${status.workforce_schedule.work_orders_open}
─────────────────────────────────
`.trim();
  }
}

export function createHomeAssistantAdapter(): HomeAssistantAdapter {
  const baseUrl = process.env.HA_URL || 'http://localhost:8123';
  const token = process.env.HA_TOKEN;

  if (!token) {
    throw new Error('HA_TOKEN environment variable is required');
  }

  return new HomeAssistantAdapter(baseUrl, token);
}
