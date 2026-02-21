import { z } from 'zod';
const HA_ENTITY_SCHEMA = z.object({
    entity_id: z.string(),
    state: z.string(),
    attributes: z.record(z.any()).optional(),
    last_changed: z.string().optional(),
    last_updated: z.string().optional(),
});
const HA_STATE_RESPONSE = z.array(HA_ENTITY_SCHEMA);
export class HomeAssistantAdapter {
    baseUrl;
    token;
    constructor(baseUrl, token) {
        this.baseUrl = baseUrl;
        this.token = token;
    }
    getHeaders() {
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
    async getState(entityId) {
        const response = await fetch(`${this.baseUrl}/api/states/${entityId}`, {
            headers: this.getHeaders(),
        });
        if (!response.ok) {
            throw new Error(`Failed to get state for ${entityId}: ${response.status} ${response.statusText}`);
        }
        return HA_ENTITY_SCHEMA.parse(await response.json());
    }
    async callService(domain, service, data) {
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
    async setInputNumber(entityId, value) {
        return this.callService('input_number', 'set_value', {
            entity_id: entityId,
            value: value,
        });
    }
    async setSwitch(entityId, on) {
        return this.callService('switch', on ? 'turn_on' : 'turn_off', {
            entity_id: entityId,
        });
    }
    async setInputBoolean(entityId, on) {
        return this.callService('input_boolean', on ? 'turn_on' : 'turn_off', {
            entity_id: entityId,
        });
    }
    async setInputText(entityId, value) {
        return this.callService('input_text', 'set_value', {
            entity_id: entityId,
            value,
        });
    }
    async setInputSelect(entityId, option) {
        return this.callService('input_select', 'select_option', {
            entity_id: entityId,
            option,
        });
    }
    // === IRRIGATION CONTROLS ===
    async turnOnIrrigation(zone) {
        const entityMap = {
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
    async turnOffIrrigation(zone) {
        const entityMap = {
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
    async turnOnPump(pump) {
        const entityMap = {
            well1: 'switch.pump_well_1',
            well2: 'switch.pump_well_2',
            main: 'switch.pump_main',
        };
        const entity = entityMap[pump];
        if (entity) {
            await this.callService('switch', 'turn_on', { entity_id: entity });
        }
    }
    async turnOffPump(pump) {
        const entityMap = {
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
    async setGreenhouseTemp(section, temp) {
        const entityMap = {
            a: 'input_number.greenhouse_temp_section_a',
            b: 'input_number.greenhouse_temp_section_b',
            c: 'input_number.greenhouse_temp_section_c',
        };
        const entity = entityMap[section];
        if (entity) {
            await this.setInputNumber(entity, temp);
        }
    }
    async setGreenhouseHumidity(section, humidity) {
        const entityMap = {
            a: 'input_number.greenhouse_humidity_a',
            b: 'input_number.greenhouse_humidity_b',
            c: 'input_number.greenhouse_humidity_c',
        };
        const entity = entityMap[section];
        if (entity) {
            await this.setInputNumber(entity, humidity);
        }
    }
    async setSoilMoisture(field, moisture) {
        const entityMap = {
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
    async getFarmStatus() {
        const states = await this.getAllStates();
        const getValue = (entityId, defaultVal = 'unknown') => {
            const entity = states.find(e => e.entity_id === entityId);
            return entity ? entity.state : defaultVal;
        };
        return {
            // Weather
            outdoorTempAvg: parseFloat(getValue('sensor.outdoor_temp_avg', 58)) || 58,
            windSpeed: parseFloat(getValue('input_number.wind_speed', 12)) || 12,
            windDirection: getValue('sensor.wind_direction_cardinal', 'N'),
            barometricPressure: parseFloat(getValue('input_number.barometric_pressure', 30.1)) || 30.1,
            rainfallToday: parseFloat(getValue('input_number.rainfall_today', 0)) || 0,
            frostRisk: getValue('binary_sensor.frost_risk') === 'on',
            heatWarning: getValue('binary_sensor.heat_warning') === 'on',
            highWindAlert: getValue('binary_sensor.high_wind_alert') === 'on',
            rainDetected: getValue('binary_sensor.rain_detected') === 'on',
            stormAlert: getValue('binary_sensor.storm_alert') === 'on',
            // Soil Moisture
            soilMoistureNorth: parseFloat(getValue('input_number.soil_moisture_north_field', 45)) || 45,
            soilMoistureSouth: parseFloat(getValue('input_number.soil_moisture_south_field', 52)) || 52,
            soilMoistureWest: parseFloat(getValue('input_number.soil_moisture_west_pasture', 38)) || 38,
            soilMoistureEast: parseFloat(getValue('input_number.soil_moisture_east_orchard', 55)) || 55,
            soilMoistureVegetable: parseFloat(getValue('input_number.soil_moisture_vegetable_field', 62)) || 62,
            soilMoistureNursery: parseFloat(getValue('input_number.soil_moisture_nursery', 70)) || 70,
            // Greenhouse
            greenhouseTempA: parseFloat(getValue('input_number.greenhouse_temp_section_a', 72)) || 72,
            greenhouseTempB: parseFloat(getValue('input_number.greenhouse_temp_section_b', 68)) || 68,
            greenhouseTempC: parseFloat(getValue('input_number.greenhouse_temp_section_c', 75)) || 75,
            greenhouseHumidityA: parseFloat(getValue('input_number.greenhouse_humidity_a', 65)) || 65,
            greenhouseHumidityB: parseFloat(getValue('input_number.greenhouse_humidity_b', 72)) || 72,
            greenhouseHumidityC: parseFloat(getValue('input_number.greenhouse_humidity_c', 58)) || 58,
            // Water
            waterTankMain: parseFloat(getValue('input_number.tank_level_main', 75000)) || 75000,
            waterTankSecondary: parseFloat(getValue('input_number.tank_level_secondary', 35000)) || 35000,
            waterTankNursery: parseFloat(getValue('input_number.tank_level_nursery', 4200)) || 4200,
            waterTankTotal: parseFloat(getValue('sensor.water_tank_total', 114200)) || 114200,
            well1Level: parseFloat(getValue('input_number.well_1_level', 78)) || 78,
            well2Level: parseFloat(getValue('input_number.well_2_level', 82)) || 82,
            pondLevel: parseFloat(getValue('input_number.pond_level', 65)) || 65,
            rainwaterCollection: parseFloat(getValue('input_number.rainwater_collection', 2500)) || 2500,
            // Power
            solarGeneration: parseFloat(getValue('input_number.solar_generation_kw', 125)) || 125,
            gridConsumption: parseFloat(getValue('input_number.grid_power_consumption', 45)) || 45,
            batteryLevel: parseFloat(getValue('input_number.battery_storage_pct', 85)) || 85,
            generatorFuel: parseFloat(getValue('input_number.generator_fuel_level', 92)) || 92,
            // Livestock
            cattleCount: parseFloat(getValue('input_number.cattle_count', 48)) || 48,
            chickenCount: parseFloat(getValue('input_number.chicken_count', 142)) || 142,
            barnTemp: parseFloat(getValue('input_number.barn_temp', 55)) || 55,
            barnHumidity: parseFloat(getValue('input_number.barn_humidity', 62)) || 62,
            feedSiloLevel: parseFloat(getValue('input_number.feed_silo_level', 72)) || 72,
            // Equipment
            tractorFuel: parseFloat(getValue('input_number.tractor_fuel', 65)) || 65,
            harvesterFuel: parseFloat(getValue('input_number.harvester_fuel', 82)) || 82,
            truck1Fuel: parseFloat(getValue('input_number.truck_fuel_1', 45)) || 45,
            truck2Fuel: parseFloat(getValue('input_number.truck_fuel_2', 58)) || 58,
            // Yields
            grainYield: parseFloat(getValue('input_number.yield_grain_current', 15250)) || 15250,
            vegetableYield: parseFloat(getValue('input_number.yield_vegetables_current', 8750)) || 8750,
            fruitYield: parseFloat(getValue('input_number.yield_fruit_current', 4200)) || 4200,
            eggsToday: parseFloat(getValue('input_number.eggs_today', 0)) || 0,
            milkToday: parseFloat(getValue('input_number.milk_today', 0)) || 0,
            // System Status
            irrigationActive: getValue('binary_sensor.irrigation_active') === 'on',
            pumpsRunning: getValue('binary_sensor.pumps_running') === 'on',
            // Compliance + Traceability
            complianceOpenItems: parseFloat(getValue('sensor.compliance_open_items', 0)) || 0,
            auditCompletenessPct: parseFloat(getValue('sensor.audit_completeness_pct', 92)) || 92,
            transferQueueCount: parseFloat(getValue('sensor.transfer_queue_count', 2)) || 2,
            qaReleaseReadiness: parseFloat(getValue('sensor.qa_release_readiness', 88)) || 88,
            metrcSyncHealth: parseFloat(getValue('sensor.metrc_sync_health', 95)) || 95,
            custodyBreakRisk: parseFloat(getValue('sensor.custody_break_risk', 6)) || 6,
            transferStatus: getValue('input_select.transfer_status', 'Ready'),
            qaHoldActive: getValue('input_boolean.qa_hold_active') === 'on',
            recallReadiness: getValue('input_boolean.recall_readiness') === 'on',
            lastManifestId: getValue('input_text.metrc_manifest_id', 'MANIFEST-PENDING'),
            lastPackageTag: getValue('input_text.metrc_last_package_tag', 'PKG-PENDING'),
            lastPlantBatchTag: getValue('input_text.metrc_last_plant_batch_tag', 'PLANT-PENDING'),
            lastCoaId: getValue('input_text.metrc_last_coa_id', 'COA-PENDING'),
        };
    }
    formatFarmStatus(status) {
        return `
🌾 FARM STATUS REPORT
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

🐄 LIVESTOCK
───────────────────────────────────────────────────────
• Cattle: ${status.cattleCount} head
• Chickens: ${status.chickenCount} head
• Barn Temp: ${status.barnTemp}°F / ${status.barnHumidity}%
• Feed Silo: ${status.feedSiloLevel}%

🚜 EQUIPMENT
───────────────────────────────────────────────────────
• Tractor: ${status.tractorFuel}%
• Harvester: ${status.harvesterFuel}%
• Truck 1: ${status.truck1Fuel}%
• Truck 2: ${status.truck2Fuel}%

📦 YIELDS (Current Season)
───────────────────────────────────────────────────────
• Grain: ${status.grainYield.toLocaleString()} bu
• Vegetables: ${status.vegetableYield.toLocaleString()} lbs
• Fruit: ${status.fruitYield.toLocaleString()} lbs
• Eggs Today: ${status.eggsToday}
• Milk Today: ${status.milkToday} gal

⚙️ SYSTEM STATUS
───────────────────────────────────────────────────────
• Irrigation Active: ${status.irrigationActive ? '🟢 YES' : '⚪ NO'}
• Pumps Running: ${status.pumpsRunning ? '🟢 YES' : '⚪ NO'}

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
    formatCompactStatus(status) {
        return `
🌾 FARM QUICK STATUS
─────────────────────────────────
🌡️ ${status.outdoorTempAvg}°F | 💧 ${status.windSpeed}mph ${status.windDirection}
💦 Water: ${(status.waterTankTotal / 1000).toFixed(1)}k gal
🌱 Moisture: N:${status.soilMoistureNorth}% S:${status.soilMoistureSouth}%
⚡ Solar: ${status.solarGeneration}kW | Battery: ${status.batteryLevel}%
🐄 ${status.cattleCount}c | 🐔 ${status.chickenCount}c
─────────────────────────────────
`.trim();
    }
}
export function createHomeAssistantAdapter() {
    const baseUrl = process.env.HA_URL || 'http://localhost:8123';
    const token = process.env.HA_TOKEN;
    if (!token) {
        throw new Error('HA_TOKEN environment variable is required');
    }
    return new HomeAssistantAdapter(baseUrl, token);
}
//# sourceMappingURL=home-assistant.js.map