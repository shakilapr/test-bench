# ESP32 Bench Telemetry Architecture

## Goal

Build a simple system that can grow without turning the ESP32 into a dashboard server.

Required capabilities:

- display live readings
- plot time series
- export data
- record sessions
- send commands
- add sensors, CAN signals, senders, receivers, and actuators later
- scale to more devices
- keep the UI minimalist and professional

The simplified decision:

```text
ESP32 = device node
MQTT = device bus
InfluxDB = time-series store
Grafana = plotting engine
Custom app = control, setup, sessions, safety, and workflow
Backend = only authority allowed to send commands
```

## System Shape

```text
Telemetry:
ESP32 -> MQTT -> backend collector -> InfluxDB -> Grafana panels -> custom web UI

Control:
custom web UI -> backend API -> MQTT command -> ESP32 -> MQTT ack -> backend -> custom web UI
```

Grafana is used for plots only. It is not the command authority.

The user sees one software interface:

```text
Custom web UI
  live cards
  embedded Grafana plots
  recording controls
  export links
  command forms
  device setup
  CAN/actuator tools later
```

## MVP

The MVP should prove the full loop without CAN, actuators, or multi-device complexity.

MVP includes:

- one ESP32-S3
- ADS1115 current reading
- ESP32-S3 chip temperature
- MQTT telemetry
- backend collector
- InfluxDB storage
- Grafana dashboard/panels
- custom web UI with embedded Grafana panels
- start/stop recording session
- CSV export path
- one safe command: `set_sample_interval`

MVP excludes:

- CAN receive/transmit
- actuators
- user accounts
- cloud access
- OTA
- raw command console
- complex calibration UI

MVP done means:

- readings appear live
- plots update
- a recording can be started/stopped
- recorded data can be exported
- `set_sample_interval` can be sent and acknowledged
- firmware does not need to be reflashed for UI changes

## Recommended Stack

| Layer | Choice | Why |
| --- | --- | --- |
| ESP firmware | Arduino on ESP32-S3 | Current project already uses this. |
| Device transport | MQTT | Simple, bidirectional, scales to many devices. |
| Broker | Mosquitto | Lightweight and standard. |
| Backend | Node.js + TypeScript + Fastify | TypeScript matches the frontend ecosystem; Fastify has built-in schema validation and is fast. |
| SQLite driver | better-sqlite3 | Synchronous and simple for low-rate control-plane state only; never use it for per-sample telemetry writes. |
| MQTT client | mqtt (npm) | Mature, well-maintained Node.js MQTT client. |
| InfluxDB client | @influxdata/influxdb-client | Official write client for InfluxDB v2. Keep backend logic on the write path and avoid app-owned Flux queries where possible. |
| Time-series DB | InfluxDB v2 | Acceptable for MVP because Grafana owns most query UX, but do not couple the app to Flux-heavy query logic. |
| Plotting | Grafana | Avoid building charting/export/time-range tooling ourselves. |
| Web UI | Svelte + Vite | Component structure, TypeScript, small output. Backend serves `dist/` as static files. |
| UI router | svelte-spa-router | Hash-based client-side routing; no SvelteKit needed since backend owns the API. |

The backend serves the built `ui/dist/` as static files in production. Users still run one backend process and open a browser. No separate frontend server, no CORS issues.

SvelteKit is not used. The project has a dedicated backend; collapsing them into a full-stack framework would add complexity for no benefit at this scale.


## Codebase Layout

The repository is an npm workspace. Each top-level folder is independently
runnable. Firmware lives in its own subdirectory so it does not crowd the
root namespace.

```text
bench-telemetry/
  firmware/             PlatformIO project (src/, include/, lib/, test/, platformio.ini)
  backend/              Node.js TypeScript server
  ui/                   Svelte + Vite frontend
  simulator/            hardware-less device simulator
  e2e/                  in-process broker + backend + sim, hits HTTP
  chaos/                resilience checks against a live stack
  infra/                optional Docker compose (Mosquitto, InfluxDB, Grafana)
  docs/                 architecture.md, wiring.md, work-plan.md, runbook.md
  package.json          npm workspaces; `npm run dev` boots the no-Docker stack
  README.md
```

Each part is independently runnable. The backend and UI do not depend on each other at build time. The backend serves the UI, but the UI can be rebuilt without touching the backend.
## Responsibilities

### ESP32

The ESP32 does:

- read sensors
- publish telemetry
- publish status
- publish device metadata
- receive whitelisted commands
- validate command parameters
- execute safe commands
- send acknowledgements
- put outputs into safe state early at boot

The ESP32 does not:

- render charts
- store recordings
- generate CSV
- serve the main UI
- manage sessions
- make safety decisions based only on the browser

### Backend

The backend does:

- subscribe to MQTT telemetry/status/metadata/ack
- write telemetry to InfluxDB
- manage recording sessions
- track active recording windows in SQLite
- expose REST APIs for UI workflows
- send commands to MQTT
- generate `cmd_id`
- track command ack/timeout state
- mark commands as `timed_out` when acknowledgements do not arrive in time
- validate actuator/CAN commands before publishing

### Grafana

Grafana does:

- time-series charts
- time range exploration
- dashboard panels
- CSV/data export from panels
- annotations/events if useful
- alerts later if needed

Grafana does not:

- publish MQTT commands
- control actuators directly
- own safety logic
- replace backend validation

### Custom Web UI

The custom UI does:

- show live status cards
- embed Grafana panels for plots
- start/stop recordings
- show command forms
- show command ack/timeout state
- show device setup/config pages
- show CAN and actuator tools later

## Data Flow

### Live Telemetry

```text
ESP32 publishes MQTT telemetry
backend receives telemetry
backend writes points to InfluxDB
Grafana panels query InfluxDB
custom UI embeds Grafana panels
```

The custom UI may also receive latest values from the backend over WebSocket for fast numeric cards. Grafana should handle the heavy plotting.

### Recording

Recording is a backend concept.

```text
UI clicks Start Recording
backend creates recording_id
backend marks device recording active
backend records start/end time in SQLite
InfluxDB stores telemetry by device and time
UI clicks Stop Recording
backend closes recording_id
Grafana/Influx query filters by device_id and recording time range
```

This avoids high-churn `recording_id` tags in InfluxDB and keeps storage simple.

### Commands

```text
UI -> backend REST command
backend validates request
backend generates cmd_id
backend publishes MQTT command
ESP32 validates again
ESP32 executes at most once per cmd_id
ESP32 publishes ack
backend updates command state
UI shows result
```

Rules:

- Grafana never publishes commands directly.
- Backend is the only command authority.
- ESP32 ignores unknown commands.
- Commands must be idempotent where possible.
- Use `set_relay_state=off`, not `toggle_relay`.
- Commands with side effects must be deduplicated by `cmd_id`.

## MQTT Topics

```text
bench/{device_id}/telemetry
bench/{device_id}/status
bench/{device_id}/meta
bench/{device_id}/cmd
bench/{device_id}/ack
```

QoS:

- telemetry: QoS 0
- status: QoS 1
- metadata: QoS 1 retained
- commands: QoS 1
- acknowledgements: QoS 1

MQTT Last Will:

- topic: `bench/{device_id}/status`
- payload state: `offline`
- retained: yes

Mosquitto should enable persistence:

```conf
persistence true
persistence_location /var/lib/mosquitto/
autosave_interval 30
```

Credential storage:

- ESP32 stores Wi-Fi and MQTT credentials in NVS after provisioning.
- `Config.h` must not contain secrets.
- backend reads MQTT, InfluxDB, and Grafana credentials from environment variables or a local ignored config file.
- MVP assumes a trusted local bench network. Backend API auth is intentionally out of scope for MVP.
- Grafana anonymous access is allowed only on a trusted isolated bench network.

If Mosquitto credentials are enabled, configure them on the broker too:

```conf
password_file /etc/mosquitto/passwd
acl_file /etc/mosquitto/acl
allow_anonymous false
```

## Protocol

### Telemetry

Topic:

```text
bench/{device_id}/telemetry
```

Payload:

```json
{
  "v": 1,
  "device_id": "bench-01",
  "boot_id": "8d95e447-2a3d-4eb4-a2fa-6ef8f23f51f4",
  "seq": 12345,
  "ms": 987654,
  "time_unix_ms": 1777550400000,
  "time_synced": true,
  "readings": {
    "current_a": 12.34,
    "chip_temp_c": 41.8
  },
  "quality": {
    "current_a": 0,
    "chip_temp_c": 0
  }
}
```

Rules:

- `device_id` is stable.
- `boot_id` changes every boot.
- `seq` increments per telemetry message.
- `readings` is flexible so new channels do not require a new transport.
- `quality` is optional per channel and stores an integer code.
- `0` means OK.
- nonzero quality codes are defined in metadata and stored as integers so the backend and Grafana can filter them cheaply.
- `time_unix_ms` is included only after NTP is synced.
- `time_synced` tells the backend whether ESP UTC time is trustworthy.
- The backend should still store its receive time; ESP time is useful for alignment and diagnostics, not as the only clock.

### Status

Topic:

```text
bench/{device_id}/status
```

Payload:

```json
{
  "v": 1,
  "device_id": "bench-01",
  "boot_id": "8d95e447-2a3d-4eb4-a2fa-6ef8f23f51f4",
  "state": "online",
  "fw": "0.2.0",
  "ip": "192.168.1.42",
  "rssi": -57,
  "sample_interval_ms": 500,
  "reset_reason": "power_on"
}
```

States:

- `online`
- `offline`
- `sensor_fault`
- `command_busy`

### Metadata

Topic:

```text
bench/{device_id}/meta
```

Payload:

```json
{
  "v": 1,
  "device_id": "bench-01",
  "metadata_version": 1,
  "channels": [
    {
      "key": "current_a",
      "label": "Current",
      "unit": "A",
      "precision": 2,
      "kind": "measurement",
      "recordable": true,
      "chartable": true
    },
    {
      "key": "chip_temp_c",
      "label": "Chip Temp",
      "unit": "degC",
      "precision": 1,
      "kind": "health",
      "recordable": true,
      "chartable": true
    }
  ],
  "commands": [
    {
      "type": "set_sample_interval",
      "label": "Sample Interval",
      "params": {
        "interval_ms": {
          "type": "number",
          "min": 100,
          "max": 10000
        }
      }
    }
  ],
  "quality_codes": {
    "current_a": {
      "0": "ok",
      "1": "saturated",
      "2": "low_snr"
    }
  }
}
```

Rules:

- metadata is retained
- backend stores latest metadata
- UI uses metadata to render cards/forms
- increment `metadata_version` only when channel/command/capability definitions change
- if a device publishes a lower `metadata_version` than the backend already has, store a warning event before replacing the cached metadata

### Command

Topic:

```text
bench/{device_id}/cmd
```

Payload:

```json
{
  "v": 1,
  "cmd_id": "c469d293-f37f-4d58-aa2e-fdf38513e5f6",
  "type": "set_sample_interval",
  "params": {
    "interval_ms": 500
  }
}
```

### Ack

Topic:

```text
bench/{device_id}/ack
```

Payload:

```json
{
  "v": 1,
  "cmd_id": "c469d293-f37f-4d58-aa2e-fdf38513e5f6",
  "status": "completed",
  "message": "sample interval updated"
}
```

Ack statuses:

- `accepted`
- `sent`
- `completed`
- `rejected`
- `failed`
- `duplicate`
- `timed_out`

Rules:

- `sent` means the ESP queued or transmitted a command but cannot prove a remote side effect.
- CAN transmit commands should typically ack as `sent`, not `completed`.
- `completed` is reserved for commands where the device can verify the local action finished.

Timeout rules:

- each command type has a timeout
- default timeout for `set_sample_interval` is 5 seconds
- backend stores `sent_at`
- a background task marks pending commands as `timed_out` after their timeout
- a late ack may still be stored, but the UI should show that it arrived after timeout

## InfluxDB Model

Use one wide point per device sample.

Do not store one point per channel. A narrow schema such as `channel=current_a` looks flexible, but it creates more series and makes wide CSV export harder. InfluxDB is a better fit when each device sample writes multiple channel fields at the same timestamp.

The backend writes telemetry to InfluxDB directly. SQLite is only for low-rate control-plane state such as devices, recordings, commands, and events.

Measurement:

```text
bench_sample
```

Tags:

- `device_id`
- optional stable hardware group tags later, for example `device_type`

Fields:

- one numeric field per channel, for example `current_a`, `chip_temp_c`
- `seq`
- `device_ms`
- `boot_id`
- `esp_time_unix_ms` when available
- optional integer quality fields, for example `current_a_quality`

Example line protocol:

```text
bench_sample,device_id=bench-01 current_a=12.34,chip_temp_c=41.8,current_a_quality=0i,seq=12345i,device_ms=987654i,boot_id="8d95e447-2a3d-4eb4-a2fa-6ef8f23f51f4"
```

Session events can be written as annotations/events:

```text
bench_event,device_id=bench-01,type=recording_start,recording_id=rec-001 value=1i
```

`recording_id` is acceptable as a tag on `bench_event` because session events are low-volume. It must not be a tag on `bench_sample`.

This is enough for Grafana to plot:

- live current
- chip temperature
- selected recording sessions by time range
- future CAN-decoded channels
- actuator state channels

Schema rules:

- `device_id` is a tag.
- channel names are fields.
- all readings from one telemetry message should be written as one Influx point where possible.
- field types must stay stable; for example `current_a` is always numeric.
- units live in metadata, not as high-churn tags.
- quality is stored as an integer field or as an event, not as a tag.
- `boot_id` is a field, not a tag, because it changes every boot.
- `recording_id` is not a tag on `bench_sample`. It is acceptable as a tag on `bench_event` because session events are low-volume.
- Recordings are still queried by `device_id` and start/stop time from SQLite, not by joining on `recording_id`.

## Backend App State

Use a small SQLite database only for workflow/state, not raw telemetry samples.

Tables needed:

- `devices`
- `device_metadata`
- `recordings`
- `commands`
- `device_events`

SQLite setup:

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
```

This keeps SQLite small and avoids building a custom time-series store.

## Backend API

Minimal API:

```text
GET  /api/devices
GET  /api/devices/{id}/latest
GET  /api/devices/{id}/meta
GET  /api/devices/{id}/events?from=...&to=...
POST /api/devices/{id}/commands
GET  /api/commands/{cmd_id}
GET  /api/recordings?device_id=...
POST /api/recordings/start
POST /api/recordings/{id}/stop
GET  /api/grafana/panels/{panel_key}?device_id=...&recording_id=...
WS   /ws/live
```

For Grafana panel URLs, `recording_id` is resolved by the backend to the recording start/stop time range. It is not assumed to be an InfluxDB tag.

Backend command response:

```json
{
  "cmd_id": "c469d293-f37f-4d58-aa2e-fdf38513e5f6",
  "status": "pending"
}
```

WebSocket event envelope:

```json
{
  "type": "telemetry",
  "payload": {}
}
```

Allowed WebSocket types:

- `telemetry`
- `device_status`
- `metadata`
- `cmd_ack`
- `device_event`
- `recording`

WebSocket reconnect:

- UI reconnects automatically with exponential backoff plus jitter.
- cap reconnect delay at 10 seconds before jitter.
- add up to 1 second of random jitter to avoid reconnect bursts after backend restarts.
- after reconnect, UI refetches latest device state and active recording state from REST.
- Grafana panels remain the plotting source; the WebSocket is for cards, status, and workflow state.

## Grafana Embedding

The custom UI embeds Grafana panels for plotting.

Panel examples:

- live current
- live chip temperature
- selected channels over time
- recording session view
- CAN decoded signal view later
- actuator state history later

Embedding rules:

- custom UI owns navigation and workflow
- Grafana owns chart panels only
- backend generates panel URLs or iframe config
- panel URLs include device/session variables
- Grafana anonymous access is acceptable only on a trusted local bench network
- otherwise users must authenticate to Grafana

Example custom UI layout:

```text
Device header: bench-01 | online | recording off
Cards: Current | Chip Temp | Wi-Fi RSSI | Last Ack
Plot area: embedded Grafana panel
Controls: Start Recording | Stop | Export | Set Sample Interval
Diagnostics: events, metadata, command history
```

## Export

Use Grafana/InfluxDB export for plotted data when possible.

For recording exports:

- backend stores recording start/stop times and `recording_id`
- export queries InfluxDB by `device_id` and the recording start/stop time range
- default export should be CSV
- wide CSV is preferred for users
- wide InfluxDB fields map directly to wide CSV columns

CSV columns:

```text
timestamp_utc,current_a,chip_temp_c,...
```

## Adding More Sensors

To add a sensor:

1. Add firmware driver.
2. Add channel to metadata.
3. Publish value under `readings`.
4. Backend writes it to InfluxDB as `bench_sample`.
5. Grafana can plot it by `channel`.
6. UI can show it from metadata.

No new database table is needed.

## CAN Expansion

CAN receive:

- decode frames in firmware or backend
- publish decoded values as normal channels
- publish bus faults as events
- keep raw CAN logging as diagnostics, not the main data model

CAN transmit:

- expose high-level commands first, for example `request_bms_status`
- raw `can.send_frame` should be hidden behind explicit confirmation
- backend validates every CAN transmit command
- ESP validates again before sending
- ack means the ESP queued/sent the frame, not that the remote CAN node accepted it

CAN metadata example:

```json
{
  "key": "can.motor_rpm",
  "label": "Motor RPM",
  "unit": "rpm",
  "precision": 0,
  "kind": "measurement",
  "recordable": true,
  "chartable": true,
  "source": {
    "interface": "can0",
    "can_id": "0x180",
    "signal": "motor_rpm",
    "scale": 0.25,
    "offset": 0
  }
}
```

## Actuator Expansion

Actuators are later-phase features because they have safety impact.

Rules:

- backend validates actuator commands
- ESP validates actuator commands again
- commands must be idempotent
- declare `safe_state`
- hardware must enforce reset-safe behavior with pull-up/pull-down resistors or driver design
- firmware drives safe state early in `setup()`
- UI shows commanded state, confirmed state, and failure state separately

Example actuator metadata:

```json
{
  "key": "relay_main",
  "label": "Main Relay",
  "kind": "relay",
  "state_channel": "relay_main.state",
  "command": "set_relay_state",
  "safe_state": "off",
  "requires_arm": true
}
```

## Firmware Layout

The firmware lives at the repository root because PlatformIO expects the project there.

```text
src/
  main.cpp           entry point: wires managers, runs loop
  Config.h           compile-time constants only, no secrets
  SensorManager.*    reads ADS1115 and chip temperature, returns TelemetrySample
  NetworkManager.*   Wi-Fi STA/AP, MQTT transport, HTTP diagnostic page
  MqttTransport.*    MQTT connect/reconnect, topic pub/sub, payload serialise
  CommandManager.*   receives commands, validates, deduplicates by cmd_id, executes
  DeviceState.*      shared runtime state (boot_id, seq counter, device_id)
  Provision.*        NVS read/write for credentials and stable device_id
include/
  Config.h
lib/
  Current_ADS1115/   ADS1115 driver with gain and rate configuration
```

One module, one responsibility. `main.cpp` only wires them together and drives the loop.

`Config.h` may contain:

- firmware version string
- protocol version integer
- metadata version integer
- MQTT topic prefix
- default sample interval
- pin assignments
- feature flags

`Config.h` must not contain Wi-Fi passwords, broker credentials, or any deployment secret. Those are provisioned at runtime and stored in NVS.

Provisioned runtime values (NVS):

- Wi-Fi SSID and password
- MQTT host, port, and credentials
- stable `device_id` (derived from MAC and stored once)
- `boot_id` source counter if not generated from MAC+millis

Time:

- ESP32 syncs NTP in station mode.
- `time_unix_ms` is only included in telemetry after sync.
- Backend receive time is the fallback and the storage source of truth.


## Backend Layout

```text
backend/
  src/
    index.ts             entry point: wires all modules, starts Fastify and MQTT
    config.ts            reads environment variables, validates on startup
    db/
      index.ts           SQLite connection, WAL and foreign key setup
      schema.ts          CREATE TABLE statements, run once on startup
      devices.ts         devices table queries
      recordings.ts      recordings table queries
      commands.ts        commands table queries
      events.ts          device_events table queries
    mqtt/
      client.ts          MQTT connection and reconnect logic
      handlers/
        telemetry.ts     parse and route incoming telemetry
        status.ts        parse and route device status
        metadata.ts      parse, validate, and store device metadata
        ack.ts           resolve pending commands from ack messages
      publisher.ts       build and publish command payloads
    influx/
      client.ts          InfluxDB connection
      writer.ts          format and write bench_sample points
    api/
      router.ts          mount all route groups on Fastify
      devices.ts         GET /api/devices, GET /api/devices/:id/latest, /meta, /events
      commands.ts        POST /api/devices/:id/commands, GET /api/commands/:cmd_id
      recordings.ts      GET /api/recordings, POST /api/recordings/start, /stop
      grafana.ts         GET /api/grafana/panels/:key
    ws/
      hub.ts             WebSocket broadcast hub, tracks connected clients
      events.ts          typed event envelope definitions
    commands/
      dispatcher.ts      validate command, generate cmd_id, publish, persist
      timeout.ts         background loop that marks stale commands timed_out
      registry.ts        command type definitions, allowed params, timeout values
    types/
      mqtt.ts            MQTT payload types (Telemetry, Status, Metadata, Ack)
      api.ts             API request and response types
      db.ts              database row types
  package.json
  tsconfig.json
  .env.example           documents required environment variables
```

Module rules:

- `index.ts` only wires modules. No business logic.
- `config.ts` validates all env vars at startup and fails fast on missing values.
- `db/` modules export pure query functions. No business logic.
- `mqtt/handlers/` modules are thin: parse, validate, call into `db/` or `influx/`, emit to `ws/hub`.
- `commands/dispatcher.ts` is the only place that generates `cmd_id` and publishes to MQTT.
- `commands/registry.ts` is the single source of truth for which commands exist and what their timeouts are.
## UI Layout

The frontend is Svelte + Vite. The backend serves `ui/dist/` as static files in production. Users open a browser and navigate to the backend address. No separate frontend server, no CORS, no configuration.

```text
ui/
  src/
    lib/
      components/
        Card.svelte          numeric reading card (label, value, unit, quality)
        GrafanaPanel.svelte  iframe wrapper with URL and time-range props
        CommandForm.svelte   validates and submits a command, shows ack/timeout
        StatusPill.svelte    online/offline/fault indicator
        RecordingBar.svelte  start/stop recording, shows active session name
        DeviceHeader.svelte  device name, status pill, last-seen time
      stores/
        device.ts            latest readings, device status, metadata
        recording.ts         active session state
        commands.ts          pending/acked/timed-out command list
        ws.ts                WebSocket connection, reconnect logic, event dispatch
      api/
        client.ts            typed fetch wrappers for all REST endpoints
      types.ts               shared TypeScript types (mirrors backend API types)
    routes/
      Live.svelte            cards + Grafana panel + RecordingBar + CommandForm
      Recordings.svelte      session list, export links, notes
      Device.svelte          metadata, status history, command history
      Setup.svelte           backend URL and Grafana URL (stored in localStorage)
      Advanced.svelte        CAN tools and actuator controls (later)
    App.svelte               router mount, nav bar, WebSocket init
    main.ts                  entry point
  dist/                      generated build output, not committed
  index.html
  vite.config.ts
  svelte.config.js
  tsconfig.json
  package.json
```

Design rules:

- Minimal. No decorative chrome.
- High contrast. Works under bench lighting.
- Every status has a clear visual state: online, offline, sensor fault, recording, command pending, ack, timeout.
- Dangerous actions (actuators, raw CAN) are visually separated and require confirmation.
- Plots come from Grafana panels, not custom chart code.
- The `dist/` directory is generated, not committed.
- Production startup should fail fast if `ui/dist/` is missing, or build it before starting.


## Dev Workflow

### Running in development

Each part runs independently.

```powershell
# 1. Start infrastructure
mosquitto                        # or use the system service
# InfluxDB and Grafana started separately (see their docs)

# 2. Start backend in dev mode (watches src/, restarts on change)
cd backend
npm install
npm run dev

# 3. Start UI dev server (HMR, proxies API to backend)
cd ui
npm install
npm run dev
# opens http://localhost:5173
# API calls are proxied to http://localhost:3000 via vite.config.ts
```

In dev mode the Vite dev server proxies all `/api` and `/ws` requests to the backend. No CORS config changes are needed.

### Building for production

```powershell
cd ui
npm run build
# output goes to ui/dist/
# do not commit ui/dist/
```

The backend serves `ui/dist/` when `NODE_ENV=production`. In development it serves nothing on `/`; the Vite dev server handles that. Production startup should check that `ui/dist/` exists and fail with a clear message or build it first.

### Running in production

```powershell
cd backend
npm run build       # compiles TypeScript to dist/
node dist/index.js
# serves API + WebSocket + ui/dist/ on one port
# open http://localhost:3000
```

For non-technical users, a `start.bat` wrapper calls this and opens the browser automatically. It must verify the UI build before starting:

```bat
@echo off
if not exist "..\ui\dist\index.html" (
  echo ui/dist not found. Building...
  pushd ..\ui
  call npm install
  call npm run build
  popd
)
if not exist "dist\index.js" (
  call npm install
  call npm run build
)
start "" http://localhost:3000
node dist\index.js
```

### Firmware

Flash and monitor with PlatformIO as normal. The backend and UI are independent.

```powershell
pio run --target upload
pio device monitor
```
## Connectivity

Devices live on flaky lab Wi-Fi. The firmware never serves any HTTP/web UI of
its own — it is purely an MQTT publisher/subscriber. All operator
interaction happens through the backend's UI; the device only speaks the
five `bench/<device_id>/{status,meta,telemetry,ack,cmd}` topics.

Reconnection strategy (see `firmware/src/NetworkManager.cpp`):

1. **Independent backoff for each layer.** Wi-Fi and MQTT each track their
   own next-attempt timestamp + current delay. Sharing one timer (the
   pre-MVP code) caused either layer to silently starve the other after a
   broker outage.
2. **Exponential backoff with jitter.** Initial delay `1 s`, doubles per
   failure, capped at `30 s`, plus up to `500 ms` of random jitter. A fleet
   coming back from a broker outage doesn't reconnect in lockstep.
3. **Last-Will-and-Testament.** On MQTT connect we register a retained LWT
   on `bench/<id>/status` so the broker publishes `{online:false}` if the
   device disappears uncleanly. The backend's `DeviceWatcher` plus the LWT
   together drive the UI's online dot.
4. **Soft watchdog.** If `WiFi.status()==WL_CONNECTED && mqtt_.connected()`
   stays false for `kConnectivityRebootMs` (default 10 minutes), the device
   calls `ESP.restart()`. Picks the unit up from kernel-stack states the
   reconnect loop alone can't escape (DHCP wedged, AP firmware bug, radio
   driver panic).
5. **No SoftAP / captive portal.** Provisioning is over USB serial only
   (`tools/provisioning`). Removing the captive-portal path keeps the
   firmware small and keeps the device off the air when it has no creds.

Operator-side connectivity checks:

- `mosquitto_sub -t 'bench/+/status' -v` — see retained online state for
  every known device. The `chaos/` harness uses this to assert the device
  recovers from a forced broker restart.
- Backend exposes `/api/health` and `/api/devices` (last_seen + last_status)
  for liveness/readiness probes from any external monitor.
- The UI's header `● live` indicator reflects backend WS connectivity, not
  device connectivity; per-device online state is shown next to its card.

## Failure Points

MVP failure points:

1. sensor wiring/noise/saturation
2. ADS1115/I2C failure
3. ESP firmware crash
4. Wi-Fi failure
5. MQTT broker down
6. backend collector down
7. InfluxDB down or disk full
8. Grafana down or bad panel URL
9. custom UI/backend API bug
10. command ack timeout or duplicate command delivery

Later target failure points add:

- CAN termination/baud/bus-off problems
- raw CAN transmit risk
- actuator electrical failure
- unsafe GPIO reset state
- metadata mismatch
- wrong-device command risk

## Phases

### Phase 1: MQTT Telemetry

- ESP publishes current and chip temperature.
- ESP publishes status and metadata.
- Mosquitto persistence and LWT are configured.

Done when:

- MQTT messages are visible with `mosquitto_sub`.
- ESP reconnects to MQTT after broker restart and republishes retained meta.
- ESP recovers from Wi-Fi drops without manual reset.

Recommended first command:

```powershell
mosquitto_sub -t "bench/#" -v
```

Do not start the backend, InfluxDB, or UI until valid telemetry/status/meta JSON is visible here.

### Phase 2: InfluxDB And Grafana

- Backend subscribes to telemetry.
- Backend writes wide `bench_sample` points to InfluxDB.
- Grafana shows current and chip temperature plots.

Done when:

- Grafana plots update live.
- Backend reconnects to MQTT and InfluxDB after either restarts, with no manual intervention.
- A backend restart does not lose retained metadata; cached metadata refills from broker.

### Phase 3: Custom UI Shell

- Custom UI embeds Grafana panels.
- UI shows latest cards from backend WebSocket/API.
- UI starts/stops recording sessions.
- UI exposes CSV export path.

Done when:

- The user can run a recorded test from one screen.
- After a backend restart, UI WebSocket reconnects with backoff+jitter and re-fetches device/recording state.
- Closing and reopening the browser tab restores correct live state from REST.

### Phase 4: Commands

- Backend exposes command API.
- Backend generates `cmd_id`.
- Backend applies per-command timeout, default 5 seconds for `set_sample_interval`.
- ESP executes `set_sample_interval`.
- ESP sends ack.
- UI shows command result.

Done when:

- Duplicate `cmd_id` does not apply twice.
- A command sent while ESP is offline either times out cleanly or is rejected; it does not silently apply on reconnect.
- Backend marks pending commands `timed_out` even if it was restarted while the command was in flight.

### Phase 5: Expansion

- Add more sensors through metadata.
- Add CAN receive as decoded channels.
- Add CAN transmit only through validated commands.
- Add actuators only with safe-state hardware and firmware rules.

Done when new channels appear in Grafana/UI without changing storage design.

## Definition Of Done

MVP is done when:

- ESP telemetry reaches MQTT.
- Backend writes telemetry to InfluxDB.
- InfluxDB uses wide `bench_sample` points, not one point per channel.
- `boot_id` is stored with samples as a field.
- Grafana plots readings.
- Custom UI embeds Grafana panels.
- User can start/stop a recording.
- User can export recorded data.
- User can send `set_sample_interval`.
- ESP sends command ack.
- Backend marks command timeout after the configured timeout.
- Duplicate command delivery is safe.
- Adding a new sensor only needs firmware metadata and a Grafana/UI config update.

Target architecture is done when:

- multiple devices work through `device_id`
- CAN decoded channels use the same telemetry path
- actuator controls use backend validation and ESP validation
- dangerous actions require confirmation
- UI remains simple while advanced tools stay in an advanced section









