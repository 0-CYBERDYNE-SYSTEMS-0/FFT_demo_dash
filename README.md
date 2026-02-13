# FarmFriend Terminal - Home Assistant Smart Farm Demo

This is a full-spectrum agricultural simulation built on Home Assistant with FarmFriend Terminal integration.

## Quick Start

### 1. Start Home Assistant

```bash
cd /Users/scrimwiggins/FFT_demo_dash
docker-compose up -d
```

Wait ~30 seconds for HA to start, then open http://localhost:8123

### 2. Complete HA Setup (First Time Only)

1. Open http://localhost:8123 in your browser
2. Create an account (username: `admin`, password: `admin1234`)
3. Set location (or skip)
4. Complete the onboarding

### 3. Get Your API Token

1. Go to http://localhost:8123/profile
2. Click on **Security** tab
3. Under "Long-Lived Access Tokens", click **Create Token**
4. Name it "FarmFriend Demo"
5. **Copy the token immediately** (it won't be shown again!)
6. Save it to `.env`:

```bash
echo "HA_TOKEN=YOUR_TOKEN_HERE" > .env
```

### 4. Test the Connection

```bash
npm install
HA_TOKEN=your_token_here npm run test:ha
```

### 5. Start Telemetry Simulation

```bash
HA_TOKEN=your_token_here npm run simulate:telemetry
```

## What's Included

### Farm Entities (100+)

- **8 Soil Moisture Sensors** - North, South, West Pasture, East Orchard, Vegetable Field, Nursery, Grain Silos A & B
- **9 Temperature Sensors** - 3 Greenhouse sections, 4 Outdoor locations, 2 Soil depths
- **4 Water Tanks** - Main (75k gal), Secondary (35k gal), Nursery (4.2k gal), total calculation
- **3 Wells + Pond + Rainwater Collection**
- **Power System** - Solar generation, grid consumption, battery storage, generator fuel
- **Greenhouse Climate** - 3 sections with temp, humidity, light, heaters, coolers, vents, shades
- **Livestock** - Cattle (48), Chickens (142), Barn environment, Feed silo, Water troughs
- **Equipment** - Tractor, Harvester, 2 Trucks with fuel tracking
- **Weather Station** - Wind speed/direction, rainfall, barometric pressure
- **Soil Nutrients** - pH levels (4 fields), N-P-K levels
- **Yields** - Grain, Vegetables, Fruit, Eggs, Milk tracking
- **Security** - Perimeter alarm, motion sensors, gate locks
- **Irrigation** - 6 zones with pumps and controls

### Dashboard Views

1. **Farm Dashboard** - Overview with weather, alerts
2. **Irrigation** - Soil moisture, controls, pump management
3. **Climate Control** - Greenhouse management
4. **Water Management** - Tank levels, wells, water quality
5. **Power & Energy** - Solar, battery, fuel levels
6. **Soil & Nutrients** - pH and N-P-K tracking
7. **Livestock** - Animal counts, environment, feeding
8. **Equipment** - Vehicle fuel and availability
9. **Storage** - Grain silos, cold storage, yields
10. **Security** - Alarms and monitoring
11. **System Status** - Quick overview

## Scripts

```bash
# Start HA and MQTT
npm run ha:start

# Stop HA
npm run ha:stop

# View HA logs
npm run ha:logs

# Restart HA
npm run ha:restart

# Test HA connection
npm run test:ha

# Run telemetry simulation
npm run simulate:telemetry
```

## FarmFriend Agent Integration

The `src/integrations/home-assistant.ts` module provides:

```typescript
import { createHomeAssistantAdapter } from './src/integrations/home-assistant.js';

const ha = createHomeAssistantAdapter();

// Get full farm status
const status = await ha.getFarmStatus();
console.log(ha.formatFarmStatus(status));

// Control irrigation
await ha.turnOnIrrigation('north');
await ha.turnOffIrrigation('south');

// Control pumps
await ha.turnOnPump('well1');
await ha.turnOffPump('main');

// Set values
await ha.setInputNumber('input_number.greenhouse_temp_section_a', 75);
await ha.setSoilMoisture('north', 65);
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| HA_URL | Home Assistant URL | http://localhost:8123 |
| HA_TOKEN | Long-Lived Access Token | (required) |

## Architecture

```
FarmFriend Agent <---> Home Assistant REST API <---> HA Entities <---> Dashboard
                           |
                           v
                      MQTT Broker (optional)
```

## Files

- `docker-compose.yml` - HA Container + Mosquitto MQTT
- `ha_config/configuration.yaml` - All farm entities
- `ha_config/ui-lovelace.yaml` - Dashboard definitions
- `src/integrations/home-assistant.ts` - Agent adapter
- `scripts/simulate-farm-telemetry.ts` - Real-time simulation

## Notes

- The simulation automatically updates soil moisture when irrigation is ON
- Solar power varies based on time of day
- Tank levels decrease when pumps/irrigation are active
- All entities can be controlled via the dashboard or API
