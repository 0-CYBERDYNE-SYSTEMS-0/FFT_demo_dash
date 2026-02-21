#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FILES=(
  "ha_config/configuration.yaml"
  "ha_config/ui-lovelace.yaml"
  "ha_config/ui-lovelace-cannabis.yaml"
)

PATTERN='earthcam_|times_square|wtc|dublin\.jpg|test-streams\.mux\.dev|camera\.ops_north_gate_live|camera\.ops_greenhouse_live|camera\.ops_equipment_live'

echo "Running media placeholder guard..."
if rg -n -i "$PATTERN" "${FILES[@]}"; then
  echo
  echo "FAIL: blocked placeholder/source strings found in active dashboard config."
  exit 1
fi

echo "PASS: no blocked placeholder/source strings found in active dashboard config."
