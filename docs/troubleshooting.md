# Troubleshooting

## "Device offline" in UI

1. Confirm the embedded broker started — backend logs `[mqtt] embedded broker
   listening on :1883` on startup.
2. Confirm the simulator (or the device firmware) is configured for
   `mqtt://<backend-host>:1883`. The simulator picks this up via `MQTT_URL`.
3. If you see the retained `online:false` LWT but no follow-up `online:true`,
   the device is reaching the broker but disconnecting before publishing
   status — check Wi-Fi signal / power.

## UI says `○ offline` (websocket)

1. Confirm the backend is running on port 3000 and `/api/health` returns ok.
2. The vite proxy targets `127.0.0.1:3000` — Windows can resolve `localhost`
   to IPv6 first which fails against an IPv4-only server.

## Commands stuck in `issued`

The backend marks a command `timed_out` after 5 s if no terminal ack arrives.

1. Confirm the device is subscribed to its command topic.
2. Look for `command <id> -> <status>` in the backend log.
3. Re-issue the command — the device dedupe ring keeps the last 16 ids and
   will return `duplicate` for a re-send of the same id.

## CSV export is empty

Recordings buffer telemetry only while a recording is active. If the device
sent samples before you hit Start, those are not in the export. The buffer is
in-memory and resets on backend restart.

## `current_a` reads `--` (sensor fault) but `chip_temp_c` works

`current_a` comes from the external ADS1115 over I2C; `chip_temp_c` is internal
to the ESP32. If the chip temp is fine but current is missing, the ADS1115 is
not responding on the I2C bus.

1. Watch the boot log for `[i2c] device at 0x48` and `[sensors] begin: ads_ok=1`.
   If `ads_ok=0`, the firmware never found the chip.
2. Check wiring against `docs/wiring.md` — `Config::kI2cSdaPin`/`kI2cSclPin` are
   the source of truth. Do not assume the ESP32-S3 default I2C pins.
3. The ADS1115 `ADDR` pin has an internal pull-down, so it can float (= `0x48`).
   Tying it to `GND` also yields `0x48`. To `VDD` = `0x49`, etc.
4. UI shows the human label from `metadata.quality_codes` (e.g. `"sensor fault"`)
   when the firmware tags a reading with quality `1`. That tag is set in
   `SensorManager` whenever the ADS read fails.

## Telemetry packets silently dropped (no UI updates, no recording rows)

The backend validates every telemetry payload with Zod and rejects malformed
ones. Look for `[mqtt] schema reject on bench/<id>/telemetry` in the backend
log — it now prints the full Zod error and the offending payload.

The most common cause is `NaN` reaching JSON. ArduinoJson serialises `NaN` as
JSON `null`, and the schema expects numbers. Firmware skips NaN readings
entirely (`buildTelemetryJson` in `firmware/src/bench/Protocol.cpp`); if you
add a new sensor channel, do the same — emit nothing rather than `NaN`.
