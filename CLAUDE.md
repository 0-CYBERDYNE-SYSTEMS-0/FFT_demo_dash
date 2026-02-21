# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

FFT_demo_dash is a Home Assistant smart farm dashboard stack used as both a live demo platform and a template repository for the FarmFriend Terminal (FFT) agricultural monitoring system. It bundles:

- A containerized Home Assistant + MQTT broker (docker-compose)
- ~206 simulated farm entities (input_numbers, input_booleans, template sensors)
- A full Lovelace YAML dashboard with 6 operational views
- A TypeScript telemetry simulation engine
- Reusable dashboard templates (views, cards, themes)

## Commands

```bash
# Start / stop the stack
npm run ha:start          # docker-compose up for HA + MQTT
npm run ha:stop
npm run ha:restart
npm run ha:logs

# Telemetry simulation (requires .env with HA_TOKEN)
npm run simulate:telemetry

# TypeScript
npm run build             # compile to dist/
npm run typecheck         # tsc --noEmit

# Home Assistant connection test
npm run test:ha

# QA scripts
npm run qa:media-guard    # check for placeholder images
npm run qa:live-embeds    # capture live dashboard screenshots
```

The sim respects env vars: `SIM_FARM_PROFILE` (mixed|drought|storm|greenhouse|high_yield), `SIM_TICK_INTERVAL_MS`, `SIM_PROFILE_SWITCH_EVERY`.

## Architecture

### Three-tier stack

```
ha_config/configuration.yaml   → entity definitions, template sensors, binary sensor alerts
ha_config/scripts.yaml         → incident mode scripts (storm, intrusion, power_failure, clear)
ha_config/ui-lovelace.yaml     → main production dashboard (4 382 lines)
ha_config/themes/default.yaml  → farm_ops_theater theme + condition-reactive themes
     ↕ REST API
src/integrations/home-assistant.ts  → HomeAssistantAdapter, FarmStatus interface (81 fields), Zod schemas
     ↕ REST API
scripts/simulate-farm-telemetry.ts  → physics-based telemetry loop; 5 profiles, 4 incident modes
```

`dashboard-templates/` holds extracted, composable versions of views, cards and themes. They are **not** auto-applied to `ui-lovelace.yaml`; changes to templates must be manually merged or applied via FFT_nano's `ha_apply_dashboard` action.

### Entity naming convention

All custom entities follow the `input_number.*` / `input_boolean.*` / `sensor.*` naming:

- Soil: `input_number.soil_moisture_<zone>` (north, south, east, west, grain_silo, vegetable, nursery)
- Temperature: `input_number.temperature_<greenhouse_a|b|c|outdoor_n|s|w|e>`
- Water tanks: `input_number.water_tank_<main|secondary|tertiary>`
- Energy: `input_number.solar_generation`, `input_number.grid_consumption`, `input_number.battery_level`
- Incident mode: `input_select.incident_mode` (Normal / Storm / Intrusion / Power Failure)

Template sensors (risk/efficiency indices, wind direction, computed averages) live under `sensor.*` in `configuration.yaml`.

### Incident modes

Scripts in `scripts.yaml` batch-update entity states to simulate emergencies. Trigger via HA UI or:

```bash
# via the TypeScript adapter
adapter.callService('input_select', 'select_option', {
  entity_id: 'input_select.incident_mode',
  option: 'Storm'
})
```

### FFT_nano integration

When running under FFT_nano the repo is mounted at `/config/` and IPC actions (`ha_get_status`, `ha_set_entity`, `ha_apply_dashboard`, `ha_capture_screenshot`) are consumed from `/workspace/ipc/main/actions/`. See `FFT_NANO_HANDOFF.md` for the full contract.

## Key Files

| File | Role |
|---|---|
| `ha_config/configuration.yaml` | All entity definitions, template sensors, HTTP/MQTT config |
| `ha_config/ui-lovelace.yaml` | Live production dashboard (edit here for immediate effect) |
| `ha_config/scripts.yaml` | Incident mode automation scripts |
| `ha_config/themes/default.yaml` | farm_ops_theater and all condition-reactive themes |
| `src/integrations/home-assistant.ts` | HA REST client + FarmStatus typed model |
| `scripts/simulate-farm-telemetry.ts` | Telemetry loop with farm profiles and incident support |
| `dashboard-templates/` | Composable view/card/theme templates for new dashboards |
| `docker-compose.yml` | HA (port 8123) + Mosquitto (1883/9001) |

## Environment

`.env` must contain:
```
HA_TOKEN=<long-lived token from http://localhost:8123/profile>
HA_URL=http://localhost:8123
```
