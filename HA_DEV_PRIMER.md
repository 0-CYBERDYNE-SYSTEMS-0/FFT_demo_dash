# Home Assistant Developer Primer

A comprehensive reference for the Home Assistant ecosystem, Lovelace UI mastery, and community dashboard tooling.

---

## Table of Contents

1. [Ecosystem & Industry Presence](#1-ecosystem--industry-presence)
2. [Scale & Community Stats](#2-scale--community-stats)
3. [Lovelace UI Architecture](#3-lovelace-ui-architecture)
4. [Dashboard YAML Structure](#4-dashboard-yaml-structure)
5. [View Types](#5-view-types)
6. [All Built-In Card Types](#6-all-built-in-card-types)
7. [Custom Cards: Development & Loading](#7-custom-cards-development--loading)
8. [HACS: Community Store](#8-hacs-community-store)
9. [Top Community Cards](#9-top-community-cards)
10. [Themes](#10-themes)
11. [Configuration Management](#11-configuration-management)
12. [Key YAML Patterns](#12-key-yaml-patterns)
13. [Where to Find Community Dashboards](#13-where-to-find-community-dashboards)

---

## 1. Ecosystem & Industry Presence

### What Home Assistant Is

Home Assistant is a free, open-source home automation platform written in Python, created by **Paulus Schoutsen** in 2013. Its core design principle: **local control and privacy** — all automation logic runs on your hardware with no mandatory cloud dependency.

Governance sits with the **Open Home Foundation** (est. 2024), a non-profit stewarding 250+ open-source projects including Home Assistant, ESPHome, Z-Wave JS, Zigpy, Music Assistant, HACS, and open voice tech (Piper). Commercial backing comes from **Nabu Casa, Inc.**, which sells Home Assistant Cloud subscriptions and official hardware.

- Open Home Foundation: https://www.openhomefoundation.org/
- Nabu Casa: https://www.nabucasa.com/
- GitHub (core): https://github.com/home-assistant/core

### Major Platform Integrations

| Platform | Integration Type |
|---|---|
| **Google** (Nest, Google Home) | Bidirectional: control HA devices via Google Home; pull Nest thermostat/camera data |
| **Amazon Alexa** | Expose HA entities to Alexa via Nabu Casa cloud or self-hosted skill |
| **Apple HomeKit** | Full bidirectional HomeKit bridge built in; HA entities appear natively in Apple Home |
| **Philips Hue** | Official built-in integration; Matter support plus native for dynamic scenes |
| **IKEA DIRIGERA / Tradfri** | Official built-in integration |
| **Sonos** | Official built-in media player integration |
| **Volvo Cars** | Official built-in integration (2025.8+) |
| **Samsung SmartThings** | Integration available |
| **Matter / Thread** | Native Matter server built in; ZBT-2 hardware for Thread border routing |
| **Zigbee** | ZHA (built-in) or Zigbee2MQTT |
| **Z-Wave** | Z-Wave JS built-in; Nabu Casa developing dedicated hardware |

### "Works With Home Assistant" Program

Launched 2022, transferred to the Open Home Foundation in 2024. Manufacturers commit to maintaining their integration with HA, providing engineering contacts, and ensuring quality UX. Certified partners display the official badge.

- Program: https://works-with.home-assistant.io/
- Certified products: https://works-with.home-assistant.io/certified-products/

---

## 2. Scale & Community Stats

As of early 2026:

| Metric | Value |
|---|---|
| Active installations | **2 million+** (announced May 2025 with 2025.5 release) |
| GitHub stars (core) | ~84,900 |
| GitHub rank | **#1 open-source project by contributors** (Octoverse 2024) |
| Built-in integrations | ~3,000 official integrations |
| Full-time contributors (OHF) | 56 people |
| r/homeassistant | ~444k subscribers |
| Translation languages | 60+ |
| Release cadence | Monthly (`YYYY.MM` format, e.g. `2026.2`) |

Key links:
- Analytics: https://analytics.home-assistant.io/statistics/
- State of the Open Home 2025: https://www.home-assistant.io/blog/2025/04/16/state-of-the-open-home-recap/
- 2M milestone post: https://www.home-assistant.io/blog/2025/05/07/release-20255/

---

## 3. Lovelace UI Architecture

Official docs: https://www.home-assistant.io/dashboards/

The dashboard system (historically "Lovelace") is HA's frontend UI layer. Structure:

```
Dashboard
└── View (tab)
    ├── Badges
    └── Cards (or Sections → Cards)
```

### YAML Mode vs UI (Storage) Mode

**Storage mode (default)** — Config stored in `.storage/lovelace` (JSON, HA-managed). Edit via drag-and-drop UI editor. No YAML file to manage.

**YAML mode** — You own a YAML file. HA does not write to it; the UI editor is disabled for that dashboard. Changes take effect after a browser refresh.

> **Migration note:** The legacy global `mode: yaml` (which put the entire default dashboard into YAML) is **removed in HA 2026.8**. Migrate to per-dashboard entries under `lovelace: dashboards:`.

---

## 4. Dashboard YAML Structure

### Registering Dashboards in `configuration.yaml`

```yaml
lovelace:
  resource_mode: yaml          # load resources from YAML, not UI
  resources:
    - url: /local/mushroom.js
      type: module
    - url: /local/mini-graph-card-bundle.js
      type: module
  dashboards:
    farm-ops:                  # unique URL slug
      mode: yaml
      filename: dashboards/farm-ops.yaml
      title: Farm Ops
      icon: mdi:tractor
      show_in_sidebar: true
      require_admin: false
```

### Dashboard File Structure

```yaml
# dashboards/farm-ops.yaml
title: Farm Operations
resources:                     # optional, can also be in configuration.yaml
  - url: /local/button-card.js
    type: module
views:
  - !include lovelace/views/overview.yaml
  - !include lovelace/views/telemetry.yaml
  - !include lovelace/views/analytics.yaml
```

---

## 5. View Types

Docs: https://www.home-assistant.io/dashboards/views/

Every view is a tab in a dashboard. Config options:

```yaml
- title: Living Room          # required; tab label
  path: living-room           # URL slug: /lovelace/living-room
  icon: mdi:sofa
  type: sections              # see types below
  theme: my-dark-theme        # applies to view and all contained cards
  background: /local/bg.jpg
  visible: true               # or [{user: <user_id>}] to restrict
  subview: false              # true = hidden from nav, shows back button
  back_path: /lovelace/overview
  max_columns: 3              # sections view only
  badges:
    - entity: sensor.outdoor_temp
  cards:
    - type: tile
      entity: light.sofa
```

| Type | `type:` value | Behavior | Docs |
|---|---|---|---|
| **Sections** | `sections` | CSS grid; cards grouped in named sections. Default since HA 2024. | https://www.home-assistant.io/dashboards/sections/ |
| **Masonry** | `masonry` | Cards flow to shortest column by height. Classic Lovelace layout. | https://www.home-assistant.io/dashboards/masonry/ |
| **Panel** | `panel` | Single full-width card filling the entire view. Best for maps, cameras, iframes. | https://www.home-assistant.io/dashboards/panel/ |
| **Sidebar** | `sidebar` | Wide main column + narrow sidebar. Use `view_layout: position: sidebar` on cards. | https://www.home-assistant.io/dashboards/sidebar/ |

### Sections View (Modern Default)

```yaml
- title: Farm Overview
  type: sections
  max_columns: 3
  sections:
    - title: Soil
      cards:
        - type: tile
          entity: input_number.soil_moisture_north
        - type: tile
          entity: input_number.soil_moisture_south
    - title: Energy
      cards:
        - type: gauge
          entity: input_number.solar_generation
```

### Subview Pattern

Useful for device detail pages linked from a main dashboard:

```yaml
- title: Greenhouse Detail
  path: greenhouse-detail
  subview: true
  back_path: /lovelace/overview
  cards:
    - type: history-graph
      entities:
        - input_number.temperature_greenhouse_a
```

---

## 6. All Built-In Card Types

Docs: https://www.home-assistant.io/dashboards/cards/

### Device-Specific

| Card | `type:` | Description | Docs |
|---|---|---|---|
| Alarm Panel | `alarm-panel` | Arm/disarm alarm entities | https://www.home-assistant.io/dashboards/alarm-panel/ |
| Light | `light` | Light control with brightness/color | https://www.home-assistant.io/dashboards/light/ |
| Humidifier | `humidifier` | Humidifier control | https://www.home-assistant.io/dashboards/humidifier/ |
| Thermostat | `thermostat` | Climate/thermostat control | https://www.home-assistant.io/dashboards/thermostat/ |
| Plant Status | `plant-status` | Plant sensor display | https://www.home-assistant.io/dashboards/plant-status/ |
| Media Control | `media-control` | Full media player controls | https://www.home-assistant.io/dashboards/media-control/ |
| Weather Forecast | `weather-forecast` | Weather entity + forecast | https://www.home-assistant.io/dashboards/weather-forecast/ |
| To-do List | `todo-list` | HA to-do/shopping lists | https://www.home-assistant.io/dashboards/todo-list/ |
| Map | `map` | Device trackers on a map | https://www.home-assistant.io/dashboards/map/ |
| Logbook | `logbook` | Entity history log | https://www.home-assistant.io/dashboards/logbook/ |
| Calendar | `calendar` | Calendar entity display | https://www.home-assistant.io/dashboards/calendar/ |

### Data Display

| Card | `type:` | Description | Docs |
|---|---|---|---|
| Gauge | `gauge` | Radial gauge for numeric sensors | https://www.home-assistant.io/dashboards/gauge/ |
| Sensor | `sensor` | Compact sensor reading + mini graph | https://www.home-assistant.io/dashboards/sensor/ |
| History Graph | `history-graph` | Line graph of entity state history | https://www.home-assistant.io/dashboards/history-graph/ |
| Statistic | `statistic` | Single long-term statistic value | https://www.home-assistant.io/dashboards/statistic/ |
| Statistics Graph | `statistics-graph` | Graph of long-term statistics (bar/line) | https://www.home-assistant.io/dashboards/statistics-graph/ |
| Webpage (iframe) | `iframe` | Embed an external URL | https://www.home-assistant.io/dashboards/iframe/ |
| Markdown | `markdown` | Render markdown + Jinja2 templates | https://www.home-assistant.io/dashboards/markdown/ |

### Control & Display

| Card | `type:` | Description | Docs |
|---|---|---|---|
| Tile | `tile` | Modern compact entity tile (primary in Sections) | https://www.home-assistant.io/dashboards/tile/ |
| Entities | `entities` | List of entities with state and controls | https://www.home-assistant.io/dashboards/entities/ |
| Entity | `entity` | Single entity with full detail | https://www.home-assistant.io/dashboards/entity/ |
| Button | `button` | Tap to toggle or call a service | https://www.home-assistant.io/dashboards/button/ |
| Glance | `glance` | Grid of entity icons with state labels | https://www.home-assistant.io/dashboards/glance/ |
| Area | `area` | Area summary with camera | https://www.home-assistant.io/dashboards/area/ |
| Heading | `heading` | Section heading / divider | — |

### Picture Cards

| Card | `type:` | Description | Docs |
|---|---|---|---|
| Picture | `picture` | Static image with optional tap action | https://www.home-assistant.io/dashboards/picture/ |
| Picture Entity | `picture-entity` | Entity state overlaid on image | https://www.home-assistant.io/dashboards/picture-entity/ |
| Picture Glance | `picture-glance` | Image with overlaid entity icons | https://www.home-assistant.io/dashboards/picture-glance/ |
| Picture Elements | `picture-elements` | Image with arbitrary positioned elements, badges, buttons — the floorplan card | https://www.home-assistant.io/dashboards/picture-elements/ |

### Layout & Logic

| Card | `type:` | Description | Docs |
|---|---|---|---|
| Vertical Stack | `vertical-stack` | Stack cards in a single column | https://www.home-assistant.io/dashboards/vertical-stack/ |
| Horizontal Stack | `horizontal-stack` | Cards side-by-side in a row | https://www.home-assistant.io/dashboards/horizontal-stack/ |
| Grid | `grid` | Cards in a CSS grid | https://www.home-assistant.io/dashboards/grid/ |
| Conditional | `conditional` | Show/hide a card based on entity state | https://www.home-assistant.io/dashboards/conditional/ |
| Entity Filter | `entity-filter` | Auto-populate a card from entity state filters | https://www.home-assistant.io/dashboards/entity-filter/ |

### Card Reference Examples

```yaml
# Gauge
- type: gauge
  entity: input_number.soil_moisture_north
  name: North Zone
  min: 0
  max: 100
  needle: true
  severity:
    green: 40
    yellow: 20
    red: 0

# History Graph
- type: history-graph
  title: Temperature History
  entities:
    - entity: input_number.temperature_greenhouse_a
      name: GH-A
    - entity: input_number.temperature_outdoor_n
      name: Outdoor N
  hours_to_show: 24

# Picture Elements (floorplan)
- type: picture-elements
  image: /local/floorplan/barn.png
  elements:
    - type: state-badge
      entity: sensor.barn_temp
      style: { top: 45%, left: 30% }
    - type: state-icon
      entity: light.barn
      style: { top: 20%, left: 55% }
    - type: service-button
      title: Open Gate
      service: switch.turn_on
      service_data:
        entity_id: switch.farm_gate
      style: { top: 80%, left: 50% }

# Conditional
- type: conditional
  conditions:
    - condition: state
      entity: input_select.incident_mode
      state: Storm
  card:
    type: markdown
    content: "## ⚠️ Storm Mode Active"

# Entity Filter
- type: entity-filter
  entities:
    - domain: binary_sensor
  conditions:
    - condition: state
      state: "on"
  card:
    type: glance
    title: Active Alerts

# Tile with features
- type: tile
  entity: light.greenhouse_a
  name: Greenhouse A
  color: teal
  features:
    - type: light-brightness

# Markdown with Jinja2
- type: markdown
  content: >
    ## Farm Status

    Solar: **{{ states('input_number.solar_generation') | round(1) }} kW**

    Battery: **{{ states('input_number.battery_level') | round(0) }}%**

    Last updated: {{ now().strftime('%H:%M') }}
```

---

## 7. Custom Cards: Development & Loading

Docs: https://developers.home-assistant.io/docs/frontend/custom-ui/custom-card/

### Loading a Custom Card

1. Place the `.js` file in `<config>/www/`. It becomes accessible at `/local/filename.js`.
2. Register as a resource:

**YAML mode** (in `configuration.yaml` or dashboard YAML):
```yaml
lovelace:
  resources:
    - url: /local/mushroom.js
      type: module
    - url: /local/mini-graph-card-bundle.js
      type: module
```

**UI mode**: Settings > Dashboards > Resources > Add Resource.

3. Reference in YAML with the `custom:` prefix:
```yaml
- type: custom:mushroom-light-card
  entity: light.kitchen
```

HACS automatically registers resources for installed cards.

### Minimal Custom Card (Vanilla JS)

```javascript
class MyFarmCard extends HTMLElement {
  set hass(hass) {
    if (!this.content) {
      this.innerHTML = `<ha-card><div class="card-content"></div></ha-card>`;
      this.content = this.querySelector('div');
    }
    const state = hass.states[this._config.entity];
    this.content.innerHTML = `
      <b>${state.attributes.friendly_name}</b>: ${state.state}
    `;
  }

  setConfig(config) {
    if (!config.entity) throw new Error('entity is required');
    this._config = config;
  }

  getCardSize() { return 1; }
}

customElements.define('my-farm-card', MyFarmCard);

// Register in card picker
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'my-farm-card',
  name: 'My Farm Card',
  description: 'Displays a single entity state',
});
```

### Key Custom Card Interface

| Method / Property | Required | Description |
|---|---|---|
| `setConfig(config)` | Yes | Receives user YAML config as JS object. Throw `Error` if invalid. |
| `set hass(hass)` | Yes | Called on every HA state update. Store and re-render. |
| `getCardSize()` | Recommended | Returns card height in units (1 unit = 50px). Used by masonry layout. |
| `static getConfigElement()` | Optional | Returns editor element for card picker UI. |
| `static getStubConfig()` | Optional | Returns default config shown in card picker. |

**Important:**
- `setConfig` is called before `hass` is set; never access `this.hass` inside it.
- `set hass()` fires on every state change across the entire HA instance. Diff before re-rendering for performance.
- `hass` object contains: `hass.states`, `hass.services`, `hass.user`, `hass.config`, `hass.themes`, `hass.callService()`.

---

## 8. HACS: Community Store

- Site: https://www.hacs.xyz/
- GitHub: https://github.com/hacs/integration
- Install guide: https://www.hacs.xyz/docs/use/download/download/

HACS (Home Assistant Community Store) is a custom integration that adds a UI-managed store for community content. It indexes GitHub repositories and lets you discover, download, and update them from within HA.

### What HACS Manages

| Category | Installs to |
|---|---|
| Frontend (plugins) | `www/community/` (auto-registered as resource) |
| Integrations | `custom_components/` |
| Themes | `themes/` |
| AppDaemon apps | `appdaemon/apps/` |
| Python scripts | `python_scripts/` |

### Installation (Home Assistant OS/Supervised)

```bash
# Terminal / SSH add-on
wget -O - https://get.hacs.xyz | bash -
```

Then restart HA, go to Settings > Devices & Services > + Add Integration > search "HACS", and complete the GitHub OAuth device flow:
1. Copy the displayed code.
2. Visit https://github.com/login/device.
3. Paste and authorize.

### Installing a Lovelace Card via HACS

1. HACS > Frontend > Explore & Download Repositories
2. Search for the card name
3. Click Download
4. HACS auto-registers the resource
5. Refresh browser
6. Use with `type: custom:<card-type>`

### Adding a Non-Listed Repository

HACS > Frontend > three-dot menu > Custom repositories > paste GitHub URL > select category.

### Optional `configuration.yaml` Keys

```yaml
hacs:
  sidepanel_title: Community
  sidepanel_icon: mdi:github
  appdaemon: true
  python_script: true
  theme: true
```

---

## 9. Top Community Cards

Install all of these via HACS > Frontend.

| Card | GitHub | Stars | What It Does |
|---|---|---|---|
| **Mushroom Cards** | https://github.com/piitaya/lovelace-mushroom | ~4,800 | 18+ clean modern cards for all entity types. Full UI editor, zero dependencies. Best starting point for polished dashboards. |
| **button-card** | https://github.com/custom-cards/button-card | ~6,000 | Massively configurable button/tile. Supports templates, states, custom actions, arbitrary CSS. The power card. |
| **mini-graph-card** | https://github.com/kalkih/mini-graph-card | ~2,700 | Minimalist multi-entity line graphs; very configurable hours, points, colors, labels. |
| **apexcharts-card** | https://github.com/RomRider/apexcharts-card | ~1,700 | Advanced charts (line, bar, pie, radial bar) via ApexCharts.js. Best for analytics views. |
| **auto-entities** | https://github.com/thomasloven/lovelace-auto-entities | ~2,500 | Dynamically populate any card's entity list using filters and sorting. Essential for dynamic dashboards. |
| **card-mod** | https://github.com/thomasloven/lovelace-card-mod | ~2,800 | Inject arbitrary CSS into any card. Required for deep visual customization. |
| **layout-card** | https://github.com/thomasloven/lovelace-layout-card | ~1,200 | Full layout control: masonry, horizontal, grid, custom CSS grid layouts. |
| **stack-in-card** | https://github.com/custom-cards/stack-in-card | ~800 | Like vertical/horizontal-stack but with a shared card chrome (no gaps/borders between stacked cards). |
| **tabbed-card** | https://github.com/kinghat/tabbed-card | ~500 | Tabs inside a single card for switching between card sets. |
| **mini-media-player** | https://github.com/kalkih/mini-media-player | ~2,700 | Compact, highly customizable media player card. |

### Usage Examples

```yaml
# Mushroom light card
- type: custom:mushroom-light-card
  entity: light.greenhouse_a
  show_brightness_control: true
  show_color_temp_control: true
  collapsible_controls: false

# mini-graph-card: multi-entity
- type: custom:mini-graph-card
  entities:
    - entity: input_number.soil_moisture_north
      name: North
      color: "#2ecc71"
    - entity: input_number.soil_moisture_south
      name: South
      color: "#3498db"
  hours_to_show: 24
  points_per_hour: 4
  line_width: 2
  animate: true

# apexcharts-card: energy bar chart
- type: custom:apexcharts-card
  header:
    show: true
    title: Energy (7 days)
  graph_span: 7d
  chart_type: bar
  series:
    - entity: input_number.solar_generation
      name: Solar
      color: "#f39c12"
    - entity: input_number.grid_consumption
      name: Grid
      color: "#e74c3c"

# auto-entities: show all binary sensors that are "on"
- type: custom:auto-entities
  card:
    type: entities
    title: Active Alerts
  filter:
    include:
      - domain: binary_sensor
        state: "on"
  sort:
    method: last_changed
    reverse: true

# button-card with template
- type: custom:button-card
  entity: input_select.incident_mode
  name: Incident Mode
  icon: mdi:alert
  state:
    - value: Normal
      color: green
    - value: Storm
      color: blue
      icon: mdi:weather-lightning
    - value: Intrusion
      color: red
      icon: mdi:shield-alert
    - value: Power Failure
      color: orange
      icon: mdi:power-plug-off

# card-mod: style any card
- type: tile
  entity: sensor.risk_index
  card_mod:
    style: |
      ha-card {
        background: linear-gradient(135deg, #1a1a2e, #16213e);
        border: 1px solid rgba(46, 204, 113, 0.3);
        border-radius: 12px;
      }
```

---

## 10. Themes

Docs: https://www.home-assistant.io/integrations/frontend/

Themes are CSS variable overrides. Load them in `configuration.yaml`:

```yaml
frontend:
  themes: !include_dir_merge_named themes/
```

### Defining a Theme

```yaml
# themes/farm-ops-dark.yaml
farm-ops-dark:
  primary-color: "#2ecc71"
  accent-color: "#27ae60"
  primary-background-color: "#0d1117"
  secondary-background-color: "#161b22"
  card-background-color: "#1c2128"
  primary-text-color: "#c9d1d9"
  secondary-text-color: "#8b949e"
  disabled-text-color: "#484f58"
  ha-card-border-radius: "12px"
  ha-card-box-shadow: "0 2px 12px rgba(0,0,0,0.5)"
  mdc-theme-primary: "#2ecc71"

  # Custom variables for use in card-mod
  farm-green: "#2ecc71"
  farm-amber: "#f39c12"
  farm-red: "#e74c3c"
```

### Applying Themes

- **System-wide:** User Profile > Theme dropdown
- **Per view:** `theme: farm-ops-dark` in the view YAML
- **Per card:** Via `card_mod` (see card-mod)
- **Programmatically:** `frontend.set_theme` service

### Community Themes via HACS

HACS > Themes. Popular ones:
- `catppuccin/home-assistant` — pastel color palettes
- `mushroom-themes` — pairs with Mushroom Cards
- `google-theme` — Material Design 3

---

## 11. Configuration Management

Docs:
- Splitting config: https://www.home-assistant.io/docs/configuration/splitting_configuration/
- Packages: https://www.home-assistant.io/docs/configuration/packages/

### `!include` Directives

| Directive | Behavior |
|---|---|
| `!include <file>` | Inline-insert a single YAML file |
| `!include_dir_list <dir>` | Returns a YAML list; each file = one list entry |
| `!include_dir_named <dir>` | Returns a dict keyed by filename (no extension) |
| `!include_dir_merge_list <dir>` | Merges all list files into one list |
| `!include_dir_merge_named <dir>` | Merges all dict files into one dict |

Files must use `.yaml` extension.

### Recommended `configuration.yaml` Layout

```yaml
homeassistant:
  packages: !include_dir_named packages/

automation: !include_dir_merge_list automations/
script:      !include_dir_merge_named scripts/
scene:       !include_dir_merge_list scenes/

frontend:
  themes: !include_dir_merge_named themes/

lovelace:
  resource_mode: yaml
  resources: !include lovelace/resources.yaml
  dashboards:
    farm-ops:
      mode: yaml
      filename: dashboards/farm-ops.yaml
      title: Farm Ops
      icon: mdi:tractor
      show_in_sidebar: true
```

### Splitting Lovelace YAML

HA's `!include` works inside Lovelace YAML files:

```yaml
# dashboards/farm-ops.yaml
title: Farm Operations
views:
  - !include lovelace/views/overview.yaml
  - !include lovelace/views/telemetry.yaml
  - !include lovelace/views/analytics.yaml
  - !include lovelace/views/cameras.yaml
```

Each `lovelace/views/*.yaml` starts with `title:` and is a complete view definition.

### Packages: Feature-First Organization

Packages group all config for a logical feature into one file:

```yaml
# configuration.yaml
homeassistant:
  packages: !include_dir_named packages/
```

```yaml
# packages/greenhouse.yaml
input_number:
  greenhouse_target_humidity:
    name: Target Humidity
    min: 30
    max: 80
    unit_of_measurement: "%"
    icon: mdi:water-percent

automation:
  - alias: Greenhouse Humidity Alert
    trigger:
      - platform: numeric_state
        entity_id: sensor.greenhouse_humidity
        below: 40
    action:
      - service: notify.mobile_app
        data:
          message: "Greenhouse humidity low!"

sensor:
  - platform: template
    sensors:
      greenhouse_vpd:
        friendly_name: Greenhouse VPD
        value_template: "{{ states('input_number.temperature_greenhouse_a') | float }}"
        unit_of_measurement: kPa
```

**Package merging rules:**
- Platform-based (`automation`, `sensor`, `binary_sensor`) always merge freely.
- Key-based (`input_boolean`, `input_number`, `script`) need unique keys across all packages.
- `auth_providers` must remain in `configuration.yaml` (loaded before packages).

### lovelace_gen: Jinja2 in Lovelace YAML

`lovelace_gen` by Thomas Lovén (HACS: Integrations) preprocesses your Lovelace YAML through Jinja2 before HA parses it. YAML mode only.

- GitHub: https://github.com/thomasloven/hass-lovelace_gen

Activate:
```yaml
# configuration.yaml
lovelace_gen:
```

```yaml
# lovelace/views/soil.yaml — generate cards from a list
{% set zones = ['north', 'south', 'east', 'west', 'vegetable', 'nursery'] %}
title: Soil
type: sections
sections:
  - title: Moisture
    cards:
    {% for zone in zones %}
      - type: custom:mini-graph-card
        entities:
          - entity: input_number.soil_moisture_{{ zone }}
            name: {{ zone | capitalize }}
        hours_to_show: 24
    {% endfor %}
```

---

## 12. Key YAML Patterns

### Actions (`tap_action`, `hold_action`, `double_tap_action`)

```yaml
tap_action:
  action: toggle                    # toggle entity
  action: navigate
  navigation_path: /lovelace/detail
  action: call-service
  service: input_select.select_option
  service_data:
    entity_id: input_select.incident_mode
    option: Storm
  action: more-info                 # open entity info dialog
  action: url
  url_path: https://example.com
  action: none
```

### Tile Card with State Colors and Features

```yaml
- type: tile
  entity: input_number.battery_level
  name: Battery
  color: |
    {% if states('input_number.battery_level') | float > 50 %}
      green
    {% elif states('input_number.battery_level') | float > 20 %}
      yellow
    {% else %}
      red
    {% endif %}
  features:
    - type: numeric-input
      mode: slider
```

### Statistics Graph (Long-Term Analytics)

```yaml
- type: statistics-graph
  title: Monthly Energy Production
  entities:
    - entity: input_number.solar_generation
      name: Solar
      stat_types:
        - sum
        - mean
  period:
    calendar:
      period: month
  chart_type: bar
  days_to_show: 30
```

### Gauge with Severity

```yaml
- type: gauge
  entity: sensor.crop_stress_index
  name: Crop Stress
  min: 0
  max: 10
  needle: true
  severity:
    green: 0
    yellow: 4
    red: 7
```

### Iframe / Grafana Embed

```yaml
- type: iframe
  url: https://grafana.local/d/farm-overview?kiosk
  aspect_ratio: "16:9"
```

---

## 13. Where to Find Community Dashboards

| Resource | URL |
|---|---|
| r/homeassistant | https://www.reddit.com/r/homeassistant/ |
| HA Community Forums — Dashboards & Frontend | https://community.home-assistant.io/c/dashboards-frontend |
| Awesome Home Assistant (curated list) | https://github.com/frenck/awesome-home-assistant |
| GitHub topic: `lovelace-card` | https://github.com/topics/lovelace-card |
| GitHub topic: `home-assistant-dashboard` | https://github.com/topics/home-assistant-dashboard |
| SmartHomeScene (tutorials, reviews) | https://smarthomescene.com/ |
| UI Lovelace Minimalist (complete design system) | https://ui-lovelace-minimalist.github.io/UI/ |
| Dwains Dashboard (auto-generated) | https://github.com/dwainscheeren/dwains-lovelace-dashboard |

### Finding Inspiration on Reddit

The r/homeassistant subreddit regularly features detailed dashboard screenshots with config in comments. Filter by flair "Screenshots" or search:
- `site:reddit.com/r/homeassistant dashboard`
- `site:community.home-assistant.io "share your dashboard"`

---

## Quick Reference: This Project's Lovelace Stack

For FFT_demo_dash specifically:

```
ha_config/ui-lovelace.yaml          → live production dashboard (~4,382 lines)
ha_config/themes/default.yaml       → farm_ops_theater + condition-reactive themes
ha_config/www/community/            → pre-bundled HACS cards (no HACS required)
  ├── button-card.js
  ├── mini-graph-card-bundle.js
  ├── card-mod.js
  ├── layout-card.js
  ├── kiosk-mode.js
  └── bar-card.js
dashboard-templates/                → composable view/card/theme templates
  └── views/command-center.yaml
```

Custom cards in use:
- `custom:button-card` — incident mode panel, action tiles
- `custom:mini-graph-card` — all time-series telemetry views
- `custom:bar-card` — compact horizontal bar charts
- `custom:layout-card` — advanced column layouts
- `card_mod` — per-card styling overrides
- `kiosk-mode` — hide HA header/sidebar for demo display mode

To add a community card without HACS: download the `.js` bundle from the release page, place in `ha_config/www/community/`, then reference it in the `resources:` section of `ui-lovelace.yaml`.

---

## 14. Dynamic Agent Canvas Spec (Multi-Card)

The Agent Canvas view at `/local/agent-canvas.html` now supports a multi-card JSON spec file:

- `/local/agent-canvas-spec.json` (host path: `ha_config/www/agent-canvas-spec.json`)

Spec shape:

```json
{
  "version": "1.0",
  "title": "Agent Canvas",
  "layout": {
    "columns": 2,
    "gap": 16,
    "rowHeight": 300
  },
  "cards": [
    {
      "id": "card-id",
      "type": "line",
      "title": "Card Title",
      "entities": ["input_number.example"],
      "labels": ["Example"],
      "span": 1,
      "options": {}
    }
  ]
}
```

Supported card `type` values:

- `line`
- `bar`
- `radial`
- `comparison`
- `kpi`
- `markdown`
- `iframe`

Runtime behavior:

- Renderer polls and refreshes live values every cycle, even when config does not change.
- Unsupported card types display a per-card error instead of failing the whole page.
- If `agent-canvas-spec.json` is missing or invalid, renderer falls back to legacy:
  - `input_text.agent_canvas_config`
  - `input_text.agent_canvas_title`
