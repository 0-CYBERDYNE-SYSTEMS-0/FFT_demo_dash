# FFT_nano Integration Handoff Document

## Status: Ready for Integration Testing

**Date**: 2026-02-13  
**FFT_demo_dash Branch**: `feature/farm-ops-bridge` (READY)  
**FFT_nano Branch**: `feature/farm-ops-bridge` (BUILDING)

---

## Pre-Flight Checklist

### FFT_demo_dash (Dashboard Platform) - COMPLETE

- [x] Home Assistant running on port 8123 (206 entities)
- [x] Dashboard templates created at `dashboard-templates/`
- [x] Condition-reactive themes added to `ha_config/themes/default.yaml`
- [x] Lovelace schema reference documentation complete
- [x] Deliverables packaged in `fft-demo-dash-deliverables.zip`
- [x] HA token available in `.env` file

### FFT_nano (Agent Platform) - IN PROGRESS

- [x] Branch `feature/farm-ops-bridge` exists
- [x] TypeScript builds successfully
- [ ] Farm state collector running
- [ ] Action gateway responding
- [ ] Agent skills configured

---

## Environment Setup

### Required Environment Variables

```bash
# Core settings
export FARM_STATE_ENABLED=true
export HA_URL=http://localhost:8123
export HA_TOKEN=<TOKEN_FROM_FFT_demo_dash/.env>

# Dashboard repo path (for staging dashboards)
export FFT_DASHBOARD_REPO_PATH=/Users/scrimwiggins/FFT_demo_dash

# Optional: Adjust polling intervals (defaults are fine)
# export FARM_STATE_FAST_MS=15000      # 15s - current.json
# export FARM_STATE_MEDIUM_MS=120000   # 2min - alerts.json
# export FARM_STATE_SLOW_MS=900000     # 15min - devices.json
```

### Directory Structure Required

```
fft_nano/
├── data/
│   ├── farm-state/           # Created by collector
│   │   ├── current.json      # Written every 15s
│   │   ├── alerts.json       # Written every 2min
│   │   ├── devices.json      # Written every 15min
│   │   ├── calendar.json     # Written every 15min
│   │   ├── telemetry.ndjson  # Appended every 15s
│   │   ├── audit.ndjson      # Appended on actions
│   │   └── screenshots/      # Created on demand
│   └── ipc/
│       └── main/
│           ├── actions/      # Agent writes requests here
│           └── action_results/  # Host writes results here
```

### Mount Configuration (container-runner.ts)

The following mounts should be added for containers:

| Host Path | Container Path | Access | Purpose |
|-----------|----------------|--------|---------|
| `data/farm-state` | `/workspace/farm-state` | RO | All groups read farm status |
| `FFT_demo_dash/ha_config` | `/workspace/dashboard` | RW (main only) | Dashboard staging |
| `FFT_demo_dash/dashboard-templates` | `/workspace/dashboard-templates` | RO | Template library |

---

## Integration Test Procedure

### Step 1: Start Home Assistant

```bash
cd /Users/scrimwiggins/FFT_demo_dash
docker-compose up -d  # Already running
docker-compose logs -f homeassistant  # Verify healthy
```

### Step 2: Start FFT_nano Collector

```bash
cd /Users/scrimwiggins/fft_nano

# Create required directories
mkdir -p data/farm-state/screenshots
mkdir -p data/ipc/main/actions
mkdir -p data/ipc/main/action_results

# Start with environment
source /Users/scrimwiggins/FFT_demo_dash/.env
export FARM_STATE_ENABLED=true
export HA_URL=http://localhost:8123
export FFT_DASHBOARD_REPO_PATH=/Users/scrimwiggins/FFT_demo_dash

npm run dev
```

### Step 3: Verify Farm State Collection

```bash
# Wait 20 seconds, then check:
ls -la data/farm-state/
cat data/farm-state/current.json | python3 -m json.tool

# Expected output:
# - current.json with timestamp, haConnected: true, entities object
# - alerts.json with active/resolved arrays
# - telemetry.ndjson with at least one line
```

### Step 4: Test Action Gateway

```bash
# Write a test action request
cat > data/ipc/main/actions/test_get_status.json << 'EOF'
{
  "type": "farm_action",
  "action": "ha_get_status",
  "params": {},
  "requestId": "test_001"
}
EOF

# Wait 2 seconds, check for result:
cat data/ipc/main/action_results/test_001.json

# Check audit log:
cat data/farm-state/audit.ndjson
```

### Step 5: Test Toggle Action

```bash
# Turn on north irrigation
cat > data/ipc/main/actions/irrigation_on.json << 'EOF'
{
  "type": "farm_action",
  "action": "ha_call_service",
  "params": {
    "domain": "switch",
    "service": "turn_on",
    "data": {
      "entity_id": "switch.irrigation_north"
    }
  },
  "requestId": "irrigation_on_001"
}
EOF

# Verify in HA UI: http://localhost:8123
```

### Step 6: Test Dashboard Staging

```bash
# Apply a dashboard template
cat > data/ipc/main/actions/apply_dashboard.json << 'EOF'
{
  "type": "farm_action",
  "action": "ha_apply_dashboard",
  "params": {
    "stagingFile": "/workspace/dashboard/ui-lovelace-staging.yaml"
  },
  "requestId": "apply_dash_001"
}
EOF

# For this to work, you need to first write a valid YAML to:
# /Users/scrimwiggins/FFT_demo_dash/ha_config/ui-lovelace-staging.yaml
```

---

## Allowlisted Actions

| Action | Description | Params |
|--------|-------------|--------|
| `ha_get_status` | Fresh entity snapshot | `{}` |
| `ha_call_service` | Generic HA service call | `{domain, service, data}` |
| `ha_set_entity` | Set input_number/switch/boolean | `{entityId, value}` |
| `ha_restart` | Restart HA container | `{}` |
| `ha_apply_dashboard` | Apply staged Lovelace YAML | `{stagingFile}` |
| `ha_capture_screenshot` | Capture dashboard screenshot | `{view, zoom?}` |
| `farm_state_refresh` | Force collector cycle | `{}` |

---

## File Format Specifications

### current.json (updated every 15s)

```json
{
  "timestamp": "2026-02-13T10:30:00Z",
  "haConnected": true,
  "stale": false,
  "lastSuccessfulPoll": "2026-02-13T10:30:00Z",
  "entities": {
    "sensor.outdoor_temp_avg": {
      "state": "58",
      "attributes": {},
      "last_changed": "..."
    }
  },
  "alerts": [],
  "context": {
    "timeOfDay": "morning",
    "season": "winter",
    "weatherCondition": "clear",
    "alertLevel": "normal",
    "suggestedTheme": "dawn"
  }
}
```

### Action Request Format

```json
{
  "type": "farm_action",
  "action": "ha_call_service",
  "params": {
    "domain": "switch",
    "service": "turn_on",
    "data": { "entity_id": "switch.irrigation_north" }
  },
  "requestId": "act_1707830400_abc"
}
```

### Action Result Format

```json
{
  "requestId": "act_1707830400_abc",
  "status": "success",
  "result": { "entityId": "switch.irrigation_north", "newState": "on" },
  "executedAt": "2026-02-13T10:30:01Z"
}
```

---

## Agent Skills Required

### fft-farm-ops (`.pi/skills/fft-farm-ops/SKILL.md`)

The agent needs to know:
1. How to read `/workspace/farm-state/current.json` for status
2. How to write action requests to `/workspace/ipc/actions/`
3. How to poll `/workspace/ipc/action_results/` for results
4. Alert interpretation and operational recommendations
5. Guardrails: main-chat-only for write operations

### fft-dashboard-ops (`.pi/skills/fft-dashboard-ops/SKILL.md`)

The agent needs to know:
1. Template library at `/workspace/dashboard-templates/`
2. Valid Lovelace YAML structure
3. Custom cards: mushroom, apexcharts-card
4. Generate -> apply -> screenshot -> verify workflow
5. Condition-reactive theming from context
6. Guardrails: always use staging file

---

## Troubleshooting

### "HA connection failed"
- Check HA is running: `docker ps | grep homeassistant`
- Check token is valid: `curl http://localhost:8123/api/ -H "Authorization: Bearer $HA_TOKEN"`
- Check token has correct permissions in HA

### "current.json not appearing"
- Check `FARM_STATE_ENABLED=true` is set
- Check `data/farm-state/` directory exists and is writable
- Check FFT_nano logs for collector errors
- Check HA is reachable from FFT_nano process

### "Action results not appearing"
- Check action file is valid JSON with required fields
- Check `requestId` is unique
- Check IPC directories exist: `data/ipc/main/actions/` and `data/ipc/main/action_results/`
- Check FFT_nano logs for gateway errors

### "Dashboard not applying"
- Check staging file exists and is valid YAML
- Check FFT_DASHBOARD_REPO_PATH is set correctly
- Check ha_config directory is writable

---

## Deliverables from FFT_demo_dash

The following files are available in `/Users/scrimwiggins/FFT_demo_dash/`:

```
dashboard-templates/
├── views/                    # 6 view templates
├── cards/                    # 6 card components  
├── themes/                   # 7 condition-reactive themes
└── lovelace-schema-reference.md

ha_config/
├── themes/default.yaml       # Updated with all 8 themes
└── ui-lovelace.yaml          # Current working dashboard

fft-demo-dash-deliverables.zip  # Package for transfer
```

---

## Contact & Coordination

- FFT_demo_dash team maintains templates and themes
- FFT_nano team implements host-side infrastructure
- Interface contract defined in shared Farm Ops Bridge specification
- Integration issues: coordinate via GitHub or shared communication channel
