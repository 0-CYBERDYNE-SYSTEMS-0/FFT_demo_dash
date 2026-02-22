# AGENTS.md — FFT Demo Dash

Developer and agent orientation for the FFT_demo_dash holodeck demo system. Read this before touching the dashboard, simulator, or HA config.

---

## What This Repo Is

A Home Assistant smart farm demo stack used for live demos, investor showcases, and agent-driven walkthroughs. It runs:

- Containerized HA + MQTT (docker-compose)
- ~206 simulated farm entities updated every 15s
- NWS live weather blended into simulation
- 10 pre-built dramatic scenes + 3 demo sequences + 5 audience presets
- Agent commentary system: AI writes to HA entities that render live on dashboard

---

## Minimum to Run a Demo

```bash
# Terminal 1 — keep running
cd /Users/scrimwiggins/FFT_demo_dash
npm run simulate:telemetry

# Browser
http://localhost:8123
```

HA is already running (docker-compose). The sim handles live weather automatically.

---

## Agent Commentary Card

The dashboard has a full-width banner at the top of both the **Nexus** (farm) and **Executive Portfolio** (cannabis) views that is:

- **Hidden** when `input_text.agent_commentary` is empty
- **Visible** (glowing animated banner) the moment any text is written to it

### Entities the agent writes to

| Entity | Purpose | Max |
|---|---|---|
| `input_text.agent_status` | Short mode label — "Storm Response Active" | 128 chars |
| `input_text.agent_commentary` | Full reasoning / answer rendered on dashboard | 500 chars |
| `input_text.agent_decision_log` | Timestamped action log | 1024 chars |

To test manually: **HA → Developer Tools → States** → search `agent_commentary` → set any value → watch banner appear.

### Implementation detail

Uses `custom:button-card` with JS template styles (`display: none` + `height: 0` when empty). Section has `column_span: 3/4` to prevent ghost column when card is collapsed. This is the correct approach — `type: conditional` does NOT work here because it still reserves section layout space even when hidden.

---

## Scene System

Change `input_select.demo_scene` in HA States to trigger any scene instantly.

| Scene | What it does |
|---|---|
| `Golden Hour Harvest` | Solar 340kW, irrigation on, yields spiking, harvest theme |
| `Morning Irrigation Pulse` | 6 zones cascade north→nursery with delays, dawn theme |
| `Midnight Ops` | Solar 0, battery draining, security lights, night theme |
| `IPM Zone Lockdown` | Room B quarantine, drone launches, pest pressure 7.5/10 |
| `Cannabis Full Bloom` | 78°F, 52% RH, PPFD 920, EC 2.4 — all rooms optimal |
| `Fertigation Drift Crisis` | EC 3.1, pH 5.3, nutrient alarms firing |
| `Emergency Cascade` | Storm → 3s delay → intrusion, dual red alerts |
| `Drone Surveillance Sweep` | Drone progress 0→100%, anomaly score rising |
| `VIP Tour` | Everything optimal, compliance 98%+, zero alerts |
| `Compliance Audit Crunch` | METRC 78%, 35 queued transfers, audit pressure |
| `Auto (Weather-Driven)` | Return to live NWS weather mode |

Each scene script lives in `ha_config/scripts.yaml`. Each writes its own `agent_status` and `agent_commentary` automatically.

---

## Demo Sequences (~2 min automated runs)

Change `input_select.demo_sequence`:

| Sequence | What plays |
|---|---|
| `Full Day at Cedar Creek` | Dawn irrigation → midday → storm → recovery → VIP tour |
| `Cannabis Ops Showcase` | Full Bloom → IPM Lockdown → Fertigation Drift → recovery |
| `Emergency Response` | Normal → Storm+Intrusion cascade → agent recovery |

---

## Audience Presets

Change `input_select.demo_audience` to load matching canvas spec + commentary tone:

`Investor` | `Head Grower` | `Compliance Officer` | `Security Director` | `General`

---

## Live Weather

Simulator blends real NWS data (no API key) for Cedar Creek TX (30.08°N, 97.49°W) by default.

```bash
npm run demo:weather          # check current NWS conditions
npm run demo:mirror -- --location nyc --zone greenhouse_a   # mirror a city into one zone
npm run demo:set-location -- nyc-greenhouse                 # switch global farm location (requires sim restart)
```

Available locations: `cedar-creek`, `napa-valley`, `nyc`, `nyc-greenhouse`, `seattle`, `miami`, `denver`, `phoenix`, `florida-citrus`
Available zones: `greenhouse_a`, `greenhouse_b`, `greenhouse_c`, `outdoor_north`, `cannabis`

---

## Key Files

| File | Role |
|---|---|
| `ha_config/ui-lovelace.yaml` | Farm Ops dashboard (Nexus view at line 12 = agent commentary section) |
| `ha_config/ui-lovelace-cannabis.yaml` | Cannabis dashboard (Executive Portfolio at line 12 = agent commentary section) |
| `ha_config/scripts.yaml` | 10 scene scripts + 3 demo sequences + incident scripts |
| `ha_config/automations.yaml` | Time-of-day theming, weather triggers, scene/sequence/audience selectors |
| `ha_config/configuration.yaml` | All entity definitions including all control entities added for holodeck |
| `scripts/simulate-farm-telemetry.ts` | Main sim loop — imports from `weather-provider.ts` |
| `scripts/weather-provider.ts` | NWS API client (no key, cached, fallback-safe) |
| `scripts/mirror-environment.ts` | Zone-aware remote weather → HA entity mapping |
| `ha_config/www/canvas-specs/` | 15 JSON preset files (10 scenes + 5 audience) for Agent Canvas view |

---

## IPC Actions (for FFT_nano agent)

The FFT_nano agent controls this dashboard via IPC. Relevant actions:

```json
// Write agent commentary
{ "action": "ha_set_entity", "params": { "entityId": "input_text.agent_commentary", "value": "..." } }

// Trigger a scene
{ "action": "ha_call_service", "params": { "domain": "input_select", "service": "select_option", "data": { "entity_id": "input_select.demo_scene", "option": "VIP Tour" } } }

// Read current farm state
{ "action": "ha_get_status" }
```

Full syntax and scene table in `~/fft_nano/skills/runtime/fft-demo-holodeck-ops/SKILL.md`.

---

## Known Issues / Next Session

- **Agent commentary column_span**: Used `column_span: 3` (cannabis) and `column_span: 4` (nexus) to prevent ghost column when card is empty. Needs browser verification after docker reset that no empty column appears.
- **button-card `extra_styles` keyframes**: The `@keyframes agent-pulse` is defined in `extra_styles` on the button-card — verify animation actually fires in browser (button-card shadow DOM may need `:host` scope).
