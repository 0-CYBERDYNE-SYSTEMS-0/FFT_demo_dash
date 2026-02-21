# FFT Demo Dash (Companion Dashboard Templates)

`FFT_demo_dash` is the companion/template repository used by `FFT_nano` farm setup.

Primary model:
- End users install **only** `FFT_nano`.
- `FFT_nano/scripts/farm-bootstrap.sh` auto-fetches this companion repo (or updates an existing checkout), pins a configured ref/SHA, and uses the templates for demo and production onboarding.

## Primary Path: Managed by FFT_nano

From `FFT_nano`:

```bash
./scripts/farm-bootstrap.sh --mode demo
# or
./scripts/farm-bootstrap.sh --mode production
```

Optional reproducibility flags:

```bash
./scripts/farm-bootstrap.sh \
  --mode production \
  --companion-repo https://github.com/0-CYBERDYNE-SYSTEMS-0/FFT_demo_dash.git \
  --companion-ref dee8fc890845825a4e77c189ef6b6ab64676baed
```

What happens in managed setup:
- Starts Home Assistant stack from this repo.
- Opens browser links for Home Assistant onboarding and token generation.
- In production mode, discovers entities from Home Assistant and adapts mappings to real devices.
- Applies validation gate before control actions are allowed.

## Secondary Path: Standalone Local Demo

Use this only for direct dashboard/template development.

```bash
cd /Users/scrimwiggins/FFT_demo_dash
docker compose up -d
```

Then open:
- `http://localhost:8123`
- `http://localhost:8123/profile` (create long-lived access token)

Additional dashboard clone (licensed cannabis/hemp demo):
- Sidebar entry: `Licensed Cannabis Ops`
- Direct URL base: `http://localhost:8123/lovelace-cannabis`

No default credentials are assumed. Create credentials during Home Assistant onboarding.

## Telemetry Simulation

```bash
npm install
HA_TOKEN=your_token_here npm run simulate:telemetry
```

Optional scenario profiles:

```bash
SIM_FARM_PROFILE=storm HA_TOKEN=your_token_here npm run simulate:telemetry
SIM_PROFILE_SWITCH_EVERY=20 HA_TOKEN=your_token_here npm run simulate:telemetry
```

## QA Checks

```bash
npm run qa:media-guard
npm run qa:cannabis-clone
```

## What This Repo Provides

- Home Assistant Compose stack and config (`docker-compose.yml`, `ha_config/`)
- Dashboard templates and views (`dashboard-templates/`)
- Telemetry simulation scripts (`scripts/`)
- Farm integration adapter code (`src/integrations/home-assistant.ts`)

## Launch Status Reference

Canonical launch truth report (website + cross-repo alignment):
- `/Users/scrimwiggins/fft-nano-work/LAUNCH_TRUTH_REPORT.md`
