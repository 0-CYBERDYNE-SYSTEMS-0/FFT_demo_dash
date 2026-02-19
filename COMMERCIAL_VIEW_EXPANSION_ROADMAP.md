# Commercial View Expansion Roadmap (Post-Demo)

This roadmap is scoped for the next phase after parity hardening. Existing 9-view set stays unchanged for demo day.

## 1) Compliance + Traceability

Target dashboard file/path:
- `/Users/scrimwiggins/FFT_demo_dash/ha_config/ui-lovelace.yaml`
- New view: `title: Compliance`, `path: compliance`

Core cards:
- REI/PHI timer board
- Spray/fertilizer application log (last 7/30 days)
- Lot/block traceability table
- Regulatory readiness checklist

Required entities:
- Existing (reuse):
  - `input_boolean.pump_fertilizer_injection`
  - `input_number.soil_ph_north`
  - `input_number.soil_ph_south`
  - `input_number.nitrogen_level_north`
  - `input_number.nitrogen_level_south`
- New:
  - `input_text.last_spray_lot_id`
  - `input_text.last_chemical_applied`
  - `sensor.rei_minutes_remaining`
  - `sensor.phi_days_remaining`
  - `sensor.compliance_open_items`

Simulator additions (`/Users/scrimwiggins/FFT_demo_dash/scripts/simulate-farm-telemetry.ts`):
- `lastSprayLotId`
- `lastChemicalApplied`
- `reiMinutesRemaining`
- `phiDaysRemaining`
- `complianceOpenItems`

Acceptance checks:
- REI/PHI countdown updates each tick.
- Last application event updates lot/chemical metadata.
- Compliance count increases when required fields are missing.

## 2) Operations + Work Orders

Target dashboard file/path:
- `/Users/scrimwiggins/FFT_demo_dash/ha_config/ui-lovelace.yaml`
- New view: `title: Operations`, `path: operations`

Core cards:
- Active work orders by priority
- Crew assignment board
- SLA/overdue alerts
- Daily execution burndown

Required entities:
- Existing (reuse):
  - `binary_sensor.pumps_running`
  - `binary_sensor.irrigation_active`
  - `binary_sensor.motion_detected_equipment`
- New:
  - `sensor.work_orders_open`
  - `sensor.work_orders_overdue`
  - `sensor.crew_utilization_pct`
  - `input_select.shift_mode`
  - `input_text.next_critical_task`

Simulator additions:
- `workOrdersOpen`
- `workOrdersOverdue`
- `crewUtilizationPct`
- `shiftMode`
- `nextCriticalTask`

Acceptance checks:
- Overdue count increases when task age threshold is exceeded.
- Shift mode changes alter crew utilization and task completion velocity.
- Critical task text rotates based on incident/profile context.

## 3) Inputs + Inventory

Target dashboard file/path:
- `/Users/scrimwiggins/FFT_demo_dash/ha_config/ui-lovelace.yaml`
- New view: `title: Inventory`, `path: inventory`

Core cards:
- Seed/fertilizer/chemical/feed/fuel stock levels
- Burn-rate trends and days-to-stockout
- Reorder threshold warnings
- Supplier lead-time risk panel

Required entities:
- Existing (reuse):
  - `input_number.feed_silo_level`
  - `input_number.tractor_fuel`
  - `input_number.harvester_fuel`
  - `input_number.truck_fuel_1`
  - `input_number.truck_fuel_2`
- New:
  - `input_number.seed_inventory_kg`
  - `input_number.fertilizer_inventory_kg`
  - `input_number.chemical_inventory_l`
  - `sensor.inventory_stockout_risk`
  - `sensor.next_reorder_eta_days`

Simulator additions:
- `seedInventoryKg`
- `fertilizerInventoryKg`
- `chemicalInventoryL`
- `inventoryStockoutRisk`
- `nextReorderEtaDays`

Acceptance checks:
- Inventory values decrement based on active operations.
- Stockout risk escalates when projected days remaining < threshold.
- Reorder ETA warnings appear for low-critical inventory.

## 4) Harvest + Logistics

Target dashboard file/path:
- `/Users/scrimwiggins/FFT_demo_dash/ha_config/ui-lovelace.yaml`
- New view: `title: Logistics`, `path: logistics`

Core cards:
- Harvest plan vs actual by block/crop
- Bin/cold storage occupancy and risk
- Load-out queue and dispatch readiness
- Throughput trend (hourly/daily)

Required entities:
- Existing (reuse):
  - `input_number.yield_grain_current`
  - `input_number.yield_vegetables_current`
  - `input_number.yield_fruit_current`
  - `input_number.grain_storage_temp_a`
  - `input_number.grain_storage_temp_b`
  - `input_number.cold_storage_temp`
  - `input_number.cold_storage_humidity`
- New:
  - `sensor.harvest_plan_completion_pct`
  - `sensor.bin_occupancy_pct`
  - `sensor.dispatch_queue_count`
  - `binary_sensor.cold_chain_risk`

Simulator additions:
- `harvestPlanCompletionPct`
- `binOccupancyPct`
- `dispatchQueueCount`
- `coldChainRisk`

Acceptance checks:
- Plan completion tracks with simulated yield progression.
- Bin occupancy and dispatch queue react to harvest velocity.
- Cold-chain risk toggles under temperature/humidity excursions.

## 5) Commercial Performance

Target dashboard file/path:
- `/Users/scrimwiggins/FFT_demo_dash/ha_config/ui-lovelace.yaml`
- New view: `title: Commercial`, `path: commercial`

Core cards:
- Cost per acre by crop/block
- Margin by commodity
- Variance vs plan (yield + operating cost)
- Revenue efficiency KPIs

Required entities:
- Existing (reuse):
  - `sensor.ops_efficiency_index`
  - `sensor.farm_risk_index`
  - `input_number.yield_grain_current`
  - `input_number.yield_vegetables_current`
  - `input_number.yield_fruit_current`
- New:
  - `sensor.cost_per_acre_usd`
  - `sensor.gross_margin_pct`
  - `sensor.plan_variance_pct`
  - `sensor.revenue_per_acre_usd`
  - `sensor.commercial_health_score`

Simulator additions:
- `costPerAcreUsd`
- `grossMarginPct`
- `planVariancePct`
- `revenuePerAcreUsd`
- `commercialHealthScore`

Acceptance checks:
- KPI sensors move consistently with yield/fuel/input dynamics.
- Margin deteriorates when energy/fuel/input burn spikes.
- Commercial health score degrades during adverse weather + high risk profile.

## Execution Order (recommended)

1. Compliance + Traceability
2. Operations + Work Orders
3. Inputs + Inventory
4. Harvest + Logistics
5. Commercial Performance

This order front-loads auditability and execution control before financial optimization views.
