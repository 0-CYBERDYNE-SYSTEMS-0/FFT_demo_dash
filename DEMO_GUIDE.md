# FFT Demo Environment — User Guide

Everything you need to run impactful demos. Nothing left on the table.

---

## Start Every Demo (Required)

Open **two things** before anything else:

**Terminal:**
```bash
cd /Users/scrimwiggins/FFT_demo_dash
npm run simulate:telemetry
```
Leave it running. This keeps all 206 farm entities alive and pulls live NWS weather automatically.

**Browser:**
```
http://localhost:8123
```

That's the minimum. Everything else is optional on top of this.

---

## Feature 1: Live Weather (Always On)

The dashboard is automatically fed **real current weather** from the National Weather Service for Cedar Creek, TX.

What this means visually:
- Solar generation tracks actual cloud cover
- Outdoor temps match real conditions
- Wind speed is real
- If it's actually raining, rainfall entities accumulate

You don't do anything. It just works as long as the simulator is running.

**Verify it's working:**
```bash
npm run demo:weather
```
Prints current Cedar Creek NWS conditions to confirm the feed is live.

---

## Feature 2: Instant Scene Triggers (The Big One)

10 pre-built dramatic states you can fire instantly.

**How:** In HA → Developer Tools → States → search `demo_scene` → change the value

| Scene | What It Shows |
|---|---|
| **Golden Hour Harvest** | Peak solar 340kW, all irrigation on, yields climbing, warm harvest theme |
| **Morning Irrigation Pulse** | 6 zones cascade one by one with 3s delays, dawn theme |
| **Midnight Ops** | Solar zero, security lights, battery draining, deep night theme |
| **IPM Zone Lockdown** | Zone B quarantine, drone launches, pest pressure spikes to 7.5/10, emergency mode |
| **Cannabis Full Bloom** | All rooms flowering at perfect setpoints — 78°F, 52% RH, PPFD 920 |
| **Fertigation Drift Crisis** | EC 3.1, pH 5.3, nutrient alarms, charts trending wrong |
| **Emergency Cascade** | Storm hits → 3 seconds later intrusion detected → dual red alerts |
| **Drone Surveillance Sweep** | Drone progress animates 0→100%, anomaly score rising, security active |
| **VIP Tour** | Everything optimal, all metrics green, compliance 98%+, zero alerts |
| **Compliance Audit Crunch** | METRC drops to 78%, audit 72%, 35 transfer backlog, pressure building |

**Reset:** Set scene back to `Auto (Weather-Driven)` to return to live weather mode.

---

## Feature 3: Automated Demo Sequences (~2 min each)

Full narrated walkthroughs that run on their own. The agent commentary card narrates each step automatically.

**How:** HA → Developer Tools → States → search `demo_sequence` → change the value

| Sequence | What Plays |
|---|---|
| **Full Day at Cedar Creek** | Dawn irrigation → midday solar peak → storm → recovery → VIP close |
| **Cannabis Ops Showcase** | Full bloom → IPM lockdown → fertigation drift → recovery |
| **Emergency Response** | Normal ops → storm + intrusion cascade → agent recovery |

Each sequence takes ~2 minutes and narrates itself. Just set it and let it run.

---

## Feature 4: Audience Presets

Instantly reconfigures the demo tone and starting view for who's watching.

**How:** HA → Developer Tools → States → search `demo_audience` → change the value

| Audience | Starting View | Focus |
|---|---|---|
| **Investor** | Executive Portfolio | Financial KPIs, margins, energy costs |
| **Head Grower** | Cannabis Ops | Environment, fertigation, grow room detail |
| **Compliance Officer** | Compliance view | METRC, audit scores, custody chain |
| **Security Director** | Security view | Camera health, drone, access events |
| **General** | Farm Nexus | Overview — broad operational narrative |

---

## Feature 5: Agent Commentary Card

A live panel on the dashboard with an animated cyan border. Shows exactly what the agent is doing and why.

Two entities drive it:
- `input_text.agent_status` — short mode label (e.g. "Storm Response Active")
- `input_text.agent_commentary` — the agent's full reasoning

**When using FFT_nano via Telegram:** The agent writes to these automatically on every response. The dashboard updates at the same moment the Telegram reply arrives. The audience sees both simultaneously.

**Manually (for testing without the agent):** Set either entity value directly in HA → Developer Tools → States.

---

## Feature 6: Dynamic Background Images

The dashboard background photo changes per scene automatically. Each of the 10 scenes swaps in a contextually matched image (storm sky, night farm, lush grow room, etc.).

You can also set any image manually:
- HA → Developer Tools → States → `input_text.dashboard_background_url` → paste any image URL

---

## Feature 7: Mirror a Real City's Weather Into a Zone

Point any greenhouse zone at a real city's live weather right now.

```bash
npm run demo:mirror -- --location nyc --zone greenhouse_a
```

**Available locations:** `cedar-creek`, `napa-valley`, `nyc`, `nyc-greenhouse`, `seattle`, `miami`, `denver`, `phoenix`, `florida-citrus`

**Available zones:** `greenhouse_a`, `greenhouse_b`, `greenhouse_c`, `outdoor_north`, `cannabis`

**Loop mode** (re-fetches every 5 min, keeps zone tracking the city):
```bash
npm run demo:mirror -- --location seattle --zone greenhouse_b --loop
```

Demo line: *"Greenhouse B is mirroring live Seattle conditions right now."*

---

## Feature 8: Switch the Entire Farm Location

Changes the global farm location so all weather pulls from a different city.

```bash
npm run demo:set-location -- nyc-greenhouse
# then restart the simulator:
npm run simulate:telemetry
```

**Available presets:**
- `cedar-creek` — Central Texas ranch (default)
- `napa-valley` — California wine country
- `midwest-grain` — Illinois corn belt
- `colorado-hemp` — Denver area
- `florida-citrus` — Orlando
- `nyc-greenhouse` — NYC urban indoor food farm
- `seattle` — Pacific Northwest
- `phoenix` — Desert Southwest, drought profile
- `miami` — South Florida tropical

---

## Feature 9: Timelapse Mode (24 Hours in ~5 Min)

Compresses a full day into about 5 minutes. Themes cycle automatically — dawn → midday → dusk → night. Solar arc rises and falls. Great for time-lapse-style recordings.

```bash
# Stop current simulator first, then:
npm run simulate:timelapse
```

---

## Feature 10: Historical Weather Replay

Replay actual recorded weather from a specific past date. Entities step through real hourly observations.

```bash
npm run simulate:replay -- --replay 2021-02-15
```

That date (Feb 15 2021) is the Texas freeze event — dramatic demo with real data.

---

## Feature 11: FFT_nano Agent Integration (Telegram → Dashboard)

When FFT_nano is running and connected to the same HA instance:

1. A farmer asks something in Telegram
2. The agent reads live farm state
3. The agent writes to `agent_status` and `agent_commentary` (dashboard updates live)
4. The agent triggers the contextually appropriate scene
5. The Telegram reply and dashboard change happen simultaneously

**Best farmer prompts to send during recordings:**
- *"Storm coming tomorrow — what should I prepare?"* → Emergency Cascade scene
- *"I'm showing investors in 10 minutes"* → VIP Tour scene
- *"Zone B IPM alert just came in"* → IPM Zone Lockdown scene
- *"How's the grow room looking right now?"* → Cannabis Full Bloom scene
- *"Start morning irrigation"* → Morning Irrigation Pulse scene

---

## Recording Setup

- **Left window:** Telegram (iOS simulator or phone, large font)
- **Right window:** HA dashboard at `http://localhost:8123`
- **Kiosk mode:** Add `?kiosk` to the URL to hide HA chrome: `http://localhost:8123?kiosk`
- **Simulator:** Running in a hidden terminal

The viewer should see: farmer types message → dashboard transforms → agent replies. Both happen together.

---

## Quick Reference: All npm Scripts

| Command | What It Does |
|---|---|
| `npm run simulate:telemetry` | Start live simulator (always required) |
| `npm run simulate:timelapse` | 24-hour timelapse in ~5 min |
| `npm run simulate:replay -- --replay YYYY-MM-DD` | Replay historical weather |
| `npm run demo:weather` | Check current NWS conditions |
| `npm run demo:mirror -- --location <city> --zone <zone>` | Mirror city weather into a zone |
| `npm run demo:set-location -- <preset>` | Switch global farm location |
