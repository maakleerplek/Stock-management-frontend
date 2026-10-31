#!/bin/bash
# esp-ota.sh — keep the laser ESP32 on the firmware in esp/monitorOTA (cron on htl-server, every 5 min).
#
# The ESP is powered by the laser, so it is only online while the laser is on. Its heartbeat
# reports FW_VERSION (= hash of the sketch + secrets.h); the core service passes it on at
# /laser/api/esp. Different from the code here → build with arduino-cli and flash over the air.
# A version that fails 3 times is skipped until the code changes.
#
# Needs: ~/.local/bin/arduino-cli with esp32:esp32@3.3.12 and ArduinoJson@6.21.5,
# esp/monitorOTA/secrets.h (from secrets.example.h). Log: .git/esp-ota.log.
set -uo pipefail
cd "$(dirname "$(readlink -f "$0")")/.." || exit 1
SKETCH=esp/monitorOTA
CLI=${ARDUINO_CLI:-$HOME/.local/bin/arduino-cli}
FAILS=.git/esp-ota-fails

log() { echo "$(date '+%F %T') $*" >> .git/esp-ota.log; }

exec 9> .git/esp-ota.lock
flock -n 9 || exit 0
[ -f "$SKETCH/secrets.h" ] || { log "no $SKETCH/secrets.h"; exit 0; }

want=$(cat "$SKETCH/monitorOTA.ino" "$SKETCH/secrets.h" | sha256sum | cut -c1-8)
esp=$(curl -sk --max-time 5 https://localhost:8086/laser/api/esp) || exit 0
connected=$(jq -r .connected <<<"$esp"); ip=$(jq -r .ip <<<"$esp"); have=$(jq -r .fw <<<"$esp")
[ "$connected" = true ] && [ "$ip" != null ] || exit 0
[ "$have" = null ] && exit 0            # no heartbeat since the service started: wait for one
[ "$have" = "$want" ] && { rm -f "$FAILS"; exit 0; }
[ "$(grep -c "^$want$" "$FAILS" 2>/dev/null)" -ge 3 ] && exit 0

log "ESP $ip runs $have, flashing $want"
echo "#define FW_VERSION \"$want\"" > "$SKETCH/version.h"
build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT
if ! out=$("$CLI" compile -b esp32:esp32:esp32 --output-dir "$build" "$SKETCH" 2>&1); then
    log "build failed: $(tail -3 <<<"$out" | tr '\n' ' ')"; echo "$want" >> "$FAILS"; exit 0
fi
espota=$(ls "$HOME"/.arduino15/packages/esp32/hardware/esp32/*/tools/espota.py | tail -1)
pass=$(sed -n 's/^#define OTA_PASSWORD "\(.*\)".*/\1/p' "$SKETCH/secrets.h")
if out=$(timeout 180 python3 "$espota" -i "$ip" -p 3232 -a "$pass" -f "$build/monitorOTA.ino.bin" 2>&1); then
    log "flashed $want to $ip"
else
    log "upload failed: $(tail -2 <<<"$out" | tr '\n' ' ')"; echo "$want" >> "$FAILS"
fi
