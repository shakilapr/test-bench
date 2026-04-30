# Notes

Read this once, then keep
`architecture.md` and `wiring.md` open as references while you work.

## What this project is

A bench instrument: an **ESP32-S3** measures DC current via an **ADS1115 ADC
on a 75 mV / 200 A shunt** and reports it (plus the chip's internal
temperature) over MQTT. A small **Node + Svelte** stack on a laptop
visualises the live readings and lets the operator record sessions to CSV.

No cloud. No Docker. No external time-series DB. Everything runs on one
laptop next to the bench.

```
[ESP32 + ADS1115] --Wi-Fi--> [MQTT broker (Aedes, embedded in Node)]
                                          |
                              [Backend (Fastify + SQLite)]
                                          |
                                  [WebSocket]
                                          |
                                   [Svelte UI]
```

## The four moving parts

| Folder       | What it is                                     | Run with                |
| ------------ | ---------------------------------------------- | ----------------------- |
| `firmware/`  | PlatformIO/Arduino code for the ESP32-S3       | `pio run -t upload`     |
| `backend/`   | Node + Fastify + SQLite + Aedes MQTT broker    | `npm run dev` (root)    |
| `ui/`        | Svelte + Vite (live charts, CSV export)        | `npm run dev` (root)    |
| `simulator/` | Fake device for hardware-less development      | started by `npm run dev`|

`npm run dev:real` does the same as `npm run dev` but **without the
simulator**, so live data can only come from a real ESP32.

## How the data actually flows

1. **Sensor**: every 500 ms (`Config::kDefaultSampleIntervalMs`)
   `SensorManager` reads the ADS1115 over I2C and the ESP32's internal
   temp sensor.
2. **Firmware**: `TelemetryPublisher` serialises a JSON packet (see
   `Protocol.cpp::buildTelemetryJson`) and publishes it to
   `bench/<device_id>/telemetry`.
3. **Broker**: Aedes runs **inside** the Node backend on port 1883. There
   is no separate Mosquitto.
4. **Backend**: `mqtt/broker.ts` validates every payload with **Zod**.
   Valid packets go to `pipeline.ts` which writes them to SQLite (only
   while a recording is active) and broadcasts them on WebSocket.
5. **UI**: subscribes to the WS stream, renders charts, drives the
   recording start/stop and CSV export.

> **Why an embedded broker?** Fewer moving parts. One `npm start` boots
> the entire stack. Easy to reason about for a small fleet (≤ a few
> devices). For a large deployment, swap Aedes for Mosquitto and point
> firmware at it — the protocol is unchanged.

## MQTT topics (the contract)

```
bench/<device_id>/status      retained, online/offline LWT
bench/<device_id>/metadata    retained, channel descriptions + quality codes
bench/<device_id>/telemetry   live samples
bench/<device_id>/cmd         backend → device
bench/<device_id>/ack         device → backend
```

Retained messages = the broker remembers the last value. So when the UI
starts mid-session, it still sees who's online and what each channel
means. **Do not break retain semantics.**

## Why some things look weird

### Quality codes (`current_a_q`, `chip_temp_c_q` columns in CSV)

Each reading carries an integer quality code. `0` = good, anything else =
trouble. The `metadata.quality_codes` map turns the integer into a human
label (e.g. `1` → `"sensor fault"` on `current_a`). The UI shows the label
when a code is non-zero. Keeping it as an integer on the wire keeps the
payload small and makes it cheap to filter in queries.

### `NaN` is forbidden in telemetry JSON

ArduinoJson encodes `NaN` as JSON `null`. Our Zod schema demands numbers.
A single `null` rejects the **whole** packet. So the firmware **omits a
reading entirely** when its sensor is dead, instead of writing `NaN`. If
you add a new channel, do the same.

### Recording timer ticks via `setInterval`

Svelte reactivity needs a state change to re-render. The recording
elapsed time is computed from `started_at` to `now`, so we tick `now`
every second in `RecordingPanel.svelte`. Without that, the elapsed
display freezes at `0:00`.

### The firmware always brings up a SoftAP

There may be no router on the bench. `bench-<device_id>` is always
broadcasting (default password `benchsetup`, override in NVS via
`ap_pass`). A laptop can join the AP directly, run the backend there,
and capture data with no infrastructure. STA still drives the real
connection whenever the configured Wi-Fi is reachable.

### No HTTP/captive portal on the device

The ESP serves no web UI. Provisioning is **either** compile-time
(`firmware/secrets.json`, baked in by `scripts/secrets_to_defines.py`)
**or** at runtime via a `PROVISION {json}` line on the USB serial
console. No captive portal, no ESP-side HTML — keeps the binary small
and the attack surface tiny.

## I2C wiring (the gotcha that ate a session)

| ESP32-S3 | ADS1115 |
| -------- | ------- |
| `GPIO12` | `SDA`   |
| `GPIO17` | `SCL`   |
| `3V3`    | `VDD`   |
| `GND`    | `GND`   |
| —        | `ADDR` (floating ⇒ `0x48`) |

`Config::kI2cSdaPin` / `kI2cSclPin` are the **only** source of truth.
Don't trust pin labels on Espressif schematics — the dev kit silkscreen
defaults differ from what's actually wired here.

At boot the firmware **scans the I2C bus** and logs every responding
address (`[i2c] device at 0xNN`). If you don't see `0x48`, the chip is
not on the bus — recheck the four wires before suspecting code.

`current_amps = (measured_mV / 75 mV) × 200 A`. With a 15 mV input on
the shunt that is `(15/75)×200 ≈ 40 A` on the chart.

## Motor speed via PCNT (`motor_rpm`)

A Hall-effect sensor on the motor produces one (or more) pulses per
revolution. The pulse must be **level-shifted to 3.3 V** before reaching
the ESP32 — it is not 5 V tolerant.

- **Wire**: sensor signal → `GPIO33` (`Config::kHallPulsePin`); sensor
  GND → ESP32 `GND` (mandatory — voltage is only meaningful with a
  shared reference).
- **Why `GPIO33`**: not a boot-strap pin (`GPIO0/2/5/12/15` are) and has
  internal pull-ups (`GPIO34`–`GPIO39` don't), so it's the safest
  general-purpose pin that the PCNT peripheral can route to.
- **Why PCNT, not `attachInterrupt`**: the **P**ulse **C**ou**NT**er is
  a hardware peripheral — it counts edges in silicon while the CPU
  sleeps or runs other code. Interrupt-driven counting drops pulses
  under load. PCNT also has a **hardware glitch filter** (set to 1 µs
  here, `Config::kPcntGlitchNs`) that swallows commutation noise.
- **Edge config**: count **rising edges only**. Counting both edges
  doubles the RPM reading.
- **RPM math**: `rpm = (count / dt_seconds / pulses_per_rev) × 60`.
  `Config::kHallPulsesPerRev` defaults to `1.0` — set it to your
  sensor's actual pulse count per revolution.

The `motor_rpm` channel flows through the same telemetry path as
everything else (no special transport), and the UI shows it as a third
tile + chart tab on the Live panel — alongside `current_a` and
`chip_temp_c`. CSV exports include all recordable channels in one file.

### Trying it without hardware

`npm run dev` starts backend + simulator + UI together. The simulator
models the motor as a **first-order lag**: rotor speed ramps toward a
target with a time constant (rotor inertia / damping), instead of
snapping to the new value. The default duty profile cycles through
idle → cruise → boost → wind-down so the **Motor** tab shows realistic
spool-up and coast-down curves. `current_a` is coupled to RPM (more
speed = more load = more current), so the live and motor tabs move
together.

Useful flags for `npm --workspace simulator run sim --`:

| Flag | What it does |
| --- | --- |
| `--motor-target-rpm 4500` | Hold a constant target instead of the duty cycle. |
| `--motor-tau-ms 500` | Make the motor snappier (small) or sluggish (large). |
| `--motor-max-rpm 8000` | Top of the default duty profile. |
| `--motor-fault stall` | Force RPM to zero (mechanical stall). |
| `--motor-fault sensor` | Emit RPM but flag quality = 1 (Hall sensor fault). |

## Setup, in three commands

```powershell
git clone <this repo>
cd test-bench
npm install
```

Hardware-less:

```powershell
npm run dev      # backend + UI + simulator at http://localhost:5173
```

With a real ESP32:

1. Copy `firmware/secrets.example.json` → `firmware/secrets.json`. Fill
   in Wi-Fi creds, your laptop's IP, and a `device_id`.
   `secrets.json` is gitignored.
2. `pio run --project-dir firmware -t upload`
3. From the repo root: `npm run dev:real`. The board appears in the
   sidebar as soon as its retained `online` status hits the broker.

## Tests

```powershell
npm test                # backend + ui + simulator unit tests
npm run test:e2e        # in-process broker + backend + sim end-to-end
npm run test:firmware   # PlatformIO native (host-side) protocol tests
```

`test:firmware` runs the JSON builders on the host, so you can iterate
on protocol code without flashing.

## Where to make changes

| Change                                  | File                                              |
| --------------------------------------- | ------------------------------------------------- |
| Add a new sensor channel                | `SensorManager`, `TelemetryPublisher`, `MetadataSchema` in backend |
| Change sample rate                      | `Config::kDefaultSampleIntervalMs`                |
| Change pins                             | `firmware/include/Config.h` and `docs/wiring.md`  |
| Add a quality code                      | `TelemetryPublisher.cpp` (`QualityCode` array) + bump `metadata_version` |
| New MQTT topic                          | both `firmware/src/bench/Protocol.*` and `backend/src/mqtt/broker.ts` |
| New UI panel                            | `ui/src/lib/`                                     |

> **Always bump `metadata_version` after editing channels or quality
> codes.** The backend rejects metadata whose version is older than what
> it has stored, so without the bump your new metadata never replaces
> the retained old one.

## When something is broken

Start at `docs/troubleshooting.md`. The most common failures are listed
there with the exact log lines to grep for. The two big ones:

- **Nothing in the UI**: look for `[mqtt] schema reject` in the backend
  log. Zod prints the field that failed and the offending payload.
- **Only `chip_temp_c` shows, no `current_a`**: I2C wiring or pins.
  Check the boot scan for `[i2c] device at 0x48`.

## Glossary

- **Boot ID**: a UUID generated on every ESP boot. Lets the backend
  tell apart "device kept running and counter wrapped" from "device
  rebooted and reset its counter".
- **Quality code**: integer per-channel flag. `0` = good. Decoded via
  `metadata.quality_codes`.
- **Retain**: MQTT flag — broker stores the last value of a topic and
  hands it to any new subscriber. Used for `status` and `metadata`.
- **LWT (Last Will and Testament)**: a message the broker publishes for
  a client when the client disconnects ungracefully. We use it to set
  `online: false` on `status`.
- **NVS**: ESP32 non-volatile storage (a tiny key-value flash partition).
  Wi-Fi creds and `device_id` live here.
- **STA / SoftAP**: ESP32 Wi-Fi modes — _Station_ (joins an existing
  network) and _SoftAP_ (acts as an access point itself). We run both.
