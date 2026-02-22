# Lovelace Dashboard Schema Reference

This document provides a concise reference for generating valid Home Assistant Lovelace dashboards for the FFT Farm Ops system.

## Top-Level Structure

```yaml
title: Dashboard Title
theme: theme_name  # Optional: override default theme
views:
  - title: View Name
    path: view-path
    icon: mdi:icon-name
    # ... view configuration
```

## View Configuration

### Common View Properties

| Property | Type | Description |
|----------|------|-------------|
| `title` | string | Display name for the view |
| `path` | string | URL path segment (lowercase, hyphens) |
| `icon` | string | Material Design Icon (mdi:icon-name) |
| `type` | string | Layout type: `panel`, `masonry`, `sidebar`, `sections` |
| `max_columns` | number | Maximum columns (1-4) for sections layout |
| `dense_section_placement` | boolean | Enable dense card placement |
| `sections` | array | List of section objects (for sections layout) |
| `cards` | array | List of card objects (for other layouts) |

### Section Object (type: sections)

```yaml
type: grid
cards:
  - # card definitions
```

## Built-in Card Types

### entities
Display a list of entities with controls.

```yaml
type: entities
title: Card Title
entities:
  - entity: switch.example
    name: Display Name
  - entity: sensor.example
    icon: mdi:icon
```

### gauge
Display a single value as a gauge.

```yaml
type: gauge
entity: sensor.example
name: Gauge Name
unit: 'unit'
min: 0
max: 100
severity:
  green: 70
  yellow: 40
  red: 20
```

### markdown
Display formatted text.

```yaml
type: markdown
title: Card Title
content: |
  ## Heading
  Regular text
  - List item
```

### history-graph
Display historical data.

```yaml
type: history-graph
title: Graph Title
hours_to_show: 24
entities:
  - sensor.example1
  - sensor.example2
```

### logbook
Display event timeline.

```yaml
type: logbook
title: Timeline
hours_to_show: 4
```

### statistics-graph
Display statistical data.

```yaml
type: statistics-graph
title: Statistics
days_to_show: 7
chart_type: bar  # or line
stat_types:
  - min
  - mean
  - max
entities:
  - sensor.example
```

### entity-filter
Filter and display entities by state.

```yaml
type: entity-filter
title: Active Items
show_empty: false
state_filter:
  - 'on'
entities:
  - switch.example1
  - switch.example2
card:
  type: grid
  columns: 2
```

### calendar
Display calendar events.

```yaml
type: calendar
entities:
  - calendar.example
title: Schedule
initial_view: listDay  # listDay, listWeek, listMonth
```

### grid
Nested grid container.

```yaml
type: grid
title: Grid Title
columns: 2
square: false
cards:
  - # card definitions
```

## Custom Card Types

### custom:mushroom-entity-card
Compact entity display with icon.

```yaml
type: custom:mushroom-entity-card
entity: sensor.example
name: Display Name
icon: mdi:icon
primary_info: state
secondary_info: last-changed
tap_action:
  action: toggle  # or more-info, navigate, call-service
```

### custom:mushroom-chips-card
Horizontal chip display.

```yaml
type: custom:mushroom-chips-card
chips:
  - type: entity
    entity: sensor.example
    icon: mdi:icon
  - type: action
    icon: mdi:plus
    tap_action:
      action: navigate
      navigation_path: /path
```

### custom:mushroom-title-card
Section header card.

```yaml
type: custom:mushroom-title-card
title: Section Title
subtitle: Optional subtitle
```

### custom:apexcharts-card
Advanced charting with ApexCharts.

```yaml
type: custom:apexcharts-card
header:
  show: true
  title: Chart Title
  show_states: true
graph_span: 4h  # 1h, 4h, 24h, 7d, etc.
apex_config:
  chart:
    height: 260
    toolbar:
      show: false
    animations:
      enabled: false
  stroke:
    curve: smooth
    width: 2
  legend:
    show: true
    position: top
    horizontalAlign: left
  grid:
    borderColor: '#22324a'
    strokeDashArray: 3
  tooltip:
    shared: true
    intersect: false
    x:
      format: HH:mm
all_series_config:
  group_by:
    func: avg
    duration: 10min
yaxis:
  - id: y1
    min: 0
    max: 100
  - id: y2
    opposite: true
    min: 0
    max: 100
series:
  - entity: sensor.example1
    name: Series 1
    yaxis_id: y1
    type: line  # line, area, column
    color: '#00ff00'
  - entity: sensor.example2
    name: Series 2
    yaxis_id: y2
    type: area
    color: '#ff0000'
```

## Entity ID Format

Entity IDs follow the pattern: `domain.entity_name`

### Common Domains

| Domain | Description | Example |
|--------|-------------|---------|
| `sensor` | Read-only values | `sensor.outdoor_temp_avg` |
| `binary_sensor` | On/off states | `binary_sensor.frost_risk` |
| `switch` | Toggleable devices | `switch.irrigation_north` |
| `input_number` | User-settable numbers | `input_number.soil_moisture_north_field` |
| `input_boolean` | User-settable on/off | `input_boolean.pump_main_reservoir` |
| `calendar` | Calendar entities | `calendar.farm_operations` |

### Naming Conventions

- Use underscores: `soil_moisture_north`
- Lowercase only
- Include zone/area in name: `irrigation_north`, `greenhouse_temp_a`

## Conditional Card Visibility

```yaml
type: conditional
conditions:
  - entity: binary_sensor.frost_risk
    state: 'on'
card:
  type: markdown
  content: Frost warning active!
```

## Theme Application

### Global Theme
```yaml
title: Dashboard
theme: dawn
```

### Per-View Theme
```yaml
views:
  - title: Night View
    theme: night
```

### Available Themes
- `farm_ops_theater` - Default dark farm theme
- `dawn` - Early morning (5:00-8:00)
- `midday` - Daylight hours (8:00-16:00)
- `dusk` - Evening (16:00-20:00)
- `night` - Night (20:00-5:00)
- `storm` - Storm alert condition
- `frost` - Frost warning condition
- `harvest` - Harvest season

## Entity Discovery

Reference `devices.json` (at `/workspace/farm-state/devices.json`) for currently available entities:

```json
{
  "entities": [
    {"entity_id": "sensor.example", "state": "42", "attributes": {}}
  ],
  "domains": {
    "sensor": 130,
    "switch": 50,
    "binary_sensor": 25
  }
}
```

## Card Layout Best Practices

1. **Sections Layout**: Use `type: sections` with `max_columns: 3` for responsive multi-column layouts
2. **Grid Cards**: Use `type: grid` with `columns: 2-4` for card groupings
3. **Charts**: Limit to 3-6 series per chart for readability
4. **Entity Lists**: Group related entities (8-15 per card)
5. **Color Consistency**: Use consistent colors per zone across all charts

## Common Patterns

### Alert Banner
```yaml
type: entity-filter
title: Active Alerts
show_empty: false
state_filter: ['on']
entities:
  - binary_sensor.frost_risk
  - binary_sensor.storm_alert
```

### Quick Actions Grid
```yaml
type: grid
columns: 3
cards:
  - type: custom:mushroom-entity-card
    entity: switch.example
    tap_action:
      action: toggle
```

### Multi-Series Chart
```yaml
type: custom:apexcharts-card
graph_span: 4h
series:
  - entity: sensor.zone1
    type: line
  - entity: sensor.zone2
    type: line
```

## Guardrails

- Always validate YAML syntax before applying
- Use staging file: write to `/workspace/dashboard/ui-lovelace-staging.yaml`
- Never modify live `ui-lovelace.yaml` directly
- Test with small subset of entities first
- Backup before major changes (`.bak` file created automatically)

## Dynamic Canvas Spec (v1.0)

The Agent Canvas runtime can load `/local/agent-canvas-spec.json` and render a multi-card grid.

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
      "id": "climate-overview",
      "type": "line",
      "title": "Greenhouse Temperature",
      "entities": ["input_number.greenhouse_temp_section_a"],
      "labels": ["Section A"],
      "span": 2
    }
  ]
}
```

Card type options:

- `line`, `bar`, `radial`, `comparison` use `entities` and optional `labels`
- `kpi` uses `entities` and optional formatting in `options` (`prefix`, `suffix`, `decimals`)
- `markdown` uses `options.markdown` (or `options.content`)
- `iframe` uses `options.url`

Backwards compatibility:

- If the spec file is missing or invalid, the renderer falls back to `input_text.agent_canvas_config` + `input_text.agent_canvas_title`.
