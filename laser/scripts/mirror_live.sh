#!/usr/bin/env bash
# Mirror the real laser's ON/OFF from production into a test laser service (LASER_SIMULATE=1),
# so real jobs make cuts on the test page. Read-only on production.
# Usage: laser/scripts/mirror_live.sh [target]   (default http://localhost:5000)
target=${1:-http://localhost:5000}
ssh htl-server 'cd ~/Stock-management-frontend && docker compose logs -f --since 0s laser' 2>/dev/null |
  grep --line-buffered -oE '\[esp\] (ON|OFF)' |
  while read -r _ state; do
    echo "$(date +%T) $state -> $(curl -s -X POST -H 'Content-Type: application/json' -d "{\"state\":\"$state\"}" "$target/laser/api/simulate")"
  done
