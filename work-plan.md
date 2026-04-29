# Work Plan — ESP32 Bench Telemetry

This plan turns `architecture.md` into ordered, testable work. Every step has a
**unit test** column and, where relevant, an **integration / pipeline** test.
Steps are grouped by phase. Do not skip phase gates.

Conventions:

- Firmware tests use PlatformIO's Unity (`pio test -e native`).
- Backend tests use **Vitest** (unit + integration) and **Testcontainers** for
  Mosquitto/InfluxDB integration.
- UI tests use **Vitest + @testing-library/svelte** for components/stores and
  **Playwright** for one happy-path end-to-end.
- Pipeline runs in GitHub Actions: firmware build, backend unit + integration,
  UI build + unit, Playwright smoke against a docker-compose stack.

---

## Phase 0 — Scaffolding

Goal: get the repo shape right before any product code lands.

### Steps

1. **Update `.gitignore`** to ignore `node_modules/`, `**/dist/`, `.env`,
   `coverage/`, `playwright-report/`, `test-results/`, `*.heapsnapshot`,
   `.testcontainers/`.
2. **Create top-level layout**: `backend/`, `ui/`, `infra/` (compose files,
   mosquitto config, grafana provisioning), `docs/`.
3. **Add `infra/docker-compose.dev.yml`** with services: `mosquitto`,
   `influxdb` (v2), `grafana`. Bind volumes for persistence.
4. **Add `infra/mosquitto/mosquitto.conf`**: persistence on, listener 1883,
   `password_file` and `acl_file` referenced (commented out for MVP),
   `allow_anonymous true` for MVP with explicit warning comment.
5. **Add `infra/grafana/provisioning/`**: datasource pointing at InfluxDB,
   placeholder dashboard JSON.
6. **Add `.env.example`** at repo root and copies in `backend/`.
7. **GitHub Actions workflow** `.github/workflows/ci.yml`:
   - `firmware`: PlatformIO build + `pio test -e native`.
   - `backend`: `npm ci`, `npm run lint`, `npm run test:unit`,
     `npm run test:integration` (services started via compose).
   - `ui`: `npm ci`, `npm run lint`, `npm run test`, `npm run build`.
   - `e2e`: bring up `docker-compose.dev.yml`, run Playwright smoke.

### Tests

| Step | Test |
| --- | --- |
| 1 | n/a (manual: `git status` shows no junk) |
| 2 | n/a |
| 3 | `docker compose -f infra/docker-compose.dev.yml config` parses; `up -d` then `mosquitto_pub -t test -m hi && mosquitto_sub -t test -C 1` round-trip works |
| 4 | broker accepts a publish; LWT test: kill a connected client, retained `offline` arrives |
| 5 | Grafana boots and shows the provisioned datasource as healthy |
| 6 | Backend startup test fails fast when required env vars are missing |
| 7 | Each CI job green on a no-op commit |

### Done when

- `docker compose up` brings broker + db + grafana healthy.
- CI is green on an empty PR.

---

## Phase 1 — Firmware: replace AP + web UI with MQTT publisher

Goal: ESP32-S3 acts as a "dumb node" per the architecture. Remove the on-device
web UI and SoftAP, switch to STA + provisioning + MQTT.

### Steps

1. **Delete on-device UI dependency**: remove `web_ui.h` usage and the WiFiServer
   path from `NetworkManager`. Keep the file in git history; remove from build.
2. **Add `Provision` module** (`include/Provision.h`, `src/Provision.cpp`):
   - Reads/writes Wi-Fi SSID/password, MQTT host/port/user/pass, `device_id`
     from NVS via `Preferences`.
   - On first boot, falls back to a temporary captive provisioning AP that
     accepts a one-shot POST `/provision` and reboots into STA.
   - `device_id` derived from MAC if unset, then persisted.
3. **Add `DeviceState` module**: holds `boot_id` (UUIDv4 from
   `esp_random()`), monotonic `seq`, current sample interval.
4. **Rewrite `NetworkManager`**:
   - STA connect with auto-reconnect (`WiFi.onEvent`).
   - Async MQTT (use `espMqttClient` or `PubSubClient`). Choose `espMqttClient`
     because it supports QoS 1, retained, LWT cleanly.
   - LWT: topic `bench/{device_id}/status`, retained, payload state `offline`.
   - On connect, publish retained `online` status and retained `meta`.
   - Subscribe `bench/{device_id}/cmd`.
5. **Add `TelemetryPublisher`** that takes a `TelemetrySample` and emits the
   JSON shape from `architecture.md` §Telemetry.
6. **Add `CommandRouter`**:
   - Validates payload (`v`, `cmd_id`, `type`, `params`).
   - Deduplicates by `cmd_id` against a small ring buffer.
   - Whitelists `set_sample_interval` only.
   - Publishes ack to `bench/{device_id}/ack`.
7. **Update `main.cpp`** to wire the modules and remove the old SSE path.
8. **Update `Config.h`** to remove SoftAP password, keep only non-secret defaults
   (sample interval, pin map, mDNS off).

### Unit tests (`test/native/`)

| Module | Test |
| --- | --- |
| `TelemetryPublisher` | builds correct JSON given a `TelemetrySample`, including `seq` increment, `quality` integer codes, and omits `time_unix_ms` when `time_synced=false` |
| `DeviceState` | `seq` is monotonic and survives `next()` overflow gracefully; `boot_id` is a valid UUID string |
| `CommandRouter` | rejects unknown `type`; rejects out-of-range `interval_ms`; same `cmd_id` twice yields a `duplicate` ack and does not re-apply |
| `Provision` (host-mocked NVS) | round-trip read/write of credentials; missing credentials returns a "needs provisioning" state |
| Quality codes | `current_a` saturated → `1`, normal → `0` |

Add `test/native/test_main.cpp` that runs all the above with Unity. PlatformIO
env `[env:native]` with `platform = native` for host-side runs.

### Integration tests

- **MQTT round-trip rig**: a Python or Node test (`infra/tests/firmware_smoke.py`)
  brings up Mosquitto, flashes a separate ESP-IDF QEMU image OR uses a hardware
  bench fixture, then asserts:
  1. retained meta appears within 2 s of connect.
  2. telemetry arrives at expected cadence (±20 %).
  3. broker restart → ESP republishes retained meta.
  4. Wi-Fi drop (broker firewall block) → ESP recovers in < 30 s.
- For CI without hardware: run the same rig against a small **emulated firmware
  shim** in Node that publishes the same payload shape, only to validate the
  broker config and retained/LWT behavior end-to-end.

### Pipeline

- CI builds firmware (`pio run`) and runs `pio test -e native`.
- CI does not flash hardware. Hardware fixture tests are run locally before
  tagging a release; document the checklist in `docs/firmware-release.md`.

### Done when

- Architecture Phase 1 DoD passes:
  - `mosquitto_sub -t "bench/#" -v` shows valid telemetry/status/meta JSON.
  - ESP reconnects to broker after broker restart and republishes retained meta.
  - ESP recovers from Wi-Fi drop without manual reset.

---

## Phase 2 — Backend collector + InfluxDB + Grafana

Goal: backend ingests MQTT, writes wide `bench_sample` points to InfluxDB,
Grafana plots them.

### Steps

1. **`backend/` scaffold**: `package.json`, `tsconfig.json`, ESLint + Prettier,
   Vitest, `tsx` for dev.
2. **`config.ts`** validates env (`MQTT_URL`, `INFLUX_URL`, `INFLUX_TOKEN`,
   `INFLUX_ORG`, `INFLUX_BUCKET`, `SQLITE_PATH`, `PORT`, `NODE_ENV`).
3. **`db/` modules** (`better-sqlite3`): create schema on startup, expose pure
   query functions for `devices`, `device_metadata`, `recordings`, `commands`,
   `device_events`. SQLite is **only** used here, never on the telemetry path.
4. **`mqtt/client.ts`**: connect with reconnect; subscribe `bench/+/telemetry`,
   `bench/+/status`, `bench/+/meta`, `bench/+/ack`.
5. **`mqtt/handlers/telemetry.ts`**: parse, validate (Zod), call
   `influx/writer.ts`, broadcast on `ws/hub`.
6. **`mqtt/handlers/status.ts`**, **`metadata.ts`**, **`ack.ts`** per spec,
   including metadata-version-regression warning.
7. **`influx/writer.ts`**: build line protocol with the rules from
   `architecture.md` §InfluxDB Model (wide point, `boot_id` as field, integer
   quality fields). Use a small batch + flush interval.
8. **`api/` (Fastify routes)**: implement the endpoints listed in
   `architecture.md` §Backend API.
9. **`ws/hub.ts`**: broadcast typed envelopes; track clients; clean up on
   disconnect.
10. **Grafana provisioning**: datasource + "Bench Live" dashboard with `current_a`
    and `chip_temp_c` panels filtered by `device_id`.

### Unit tests

| File | Test |
| --- | --- |
| `mqtt/handlers/telemetry.test.ts` | rejects payload missing `device_id`/`boot_id`; accepts valid; calls `influx.write` with correct fields |
| `mqtt/handlers/metadata.test.ts` | stores higher version; logs warning + still updates cache when lower version arrives |
| `mqtt/handlers/ack.test.ts` | resolves pending command; ignores unknown `cmd_id`; correctly maps `sent` vs `completed` |
| `influx/writer.test.ts` | line protocol matches golden fixtures, including integer quality fields and stable field types |
| `commands/dispatcher.test.ts` | generates UUID `cmd_id`; persists pending; publishes correct payload |
| `commands/timeout.test.ts` | marks pending older than timeout as `timed_out`; late ack flagged "after timeout" |
| `db/recordings.test.ts` | start/stop, can't start two on the same device, list filters by device |
| `ws/hub.test.ts` | broadcasts only known event types; drops disconnected clients |
| `config.test.ts` | throws with a clear message when required env vars missing |

### Integration tests (`backend/test/integration/`)

- **MQTT → Influx**: spin up Mosquitto + InfluxDB via Testcontainers, publish
  one telemetry message, query Influx, assert one wide point exists with the
  expected fields.
- **Backend restart**: kill the backend mid-stream, restart, assert
  - retained meta is reapplied,
  - WS clients can reconnect and refetch state via REST,
  - pending commands older than timeout are reaped.
- **Command round-trip with stub firmware**: a test publisher acts as the ESP,
  acks commands; assert command lifecycle pending → completed.

### Pipeline

- CI runs `npm run test:unit` always.
- CI runs `npm run test:integration` with services started by Testcontainers.

### Done when

- Architecture Phase 2 DoD passes:
  - Grafana plots update live.
  - Backend reconnects to MQTT and InfluxDB after either restarts.
  - Cached metadata refills from broker after backend restart.

---

## Phase 3 — Custom UI shell

Goal: one screen for live cards + Grafana panel + recording controls.

### Steps

1. **`ui/` scaffold**: Vite + Svelte + TypeScript, ESLint + Prettier, Vitest +
   `@testing-library/svelte`, Playwright config.
2. **`lib/api/client.ts`**: typed fetch wrappers for every endpoint listed in
   the spec.
3. **`lib/stores/ws.ts`**: WebSocket connection with **exponential backoff +
   jitter**, capped at 10 s before jitter, ≤ 1 s random jitter. After reconnect,
   refetch device + recording state via REST.
4. **`lib/stores/device.ts`**, **`recording.ts`**, **`commands.ts`**.
5. **Components**: `Card`, `GrafanaPanel`, `CommandForm`, `StatusPill`,
   `RecordingBar`, `DeviceHeader`.
6. **Routes**: `Live`, `Recordings`, `Device`, `Setup`, `Advanced` (feature-
   flagged off until Phase 5).
7. **Production build wiring**: backend serves `ui/dist/` only when it exists;
   fail fast otherwise.

### Unit tests

| File | Test |
| --- | --- |
| `stores/ws.test.ts` | reconnect schedule respects backoff cap and adds jitter; on `open`, calls REST refetchers exactly once |
| `stores/device.test.ts` | telemetry events update latest readings; status events update status pill |
| `stores/commands.test.ts` | optimistic pending entry; ack updates state; timeout marks entry expired |
| `components/Card.test.ts` | shows unit + precision from metadata; quality `0` hidden, nonzero shows label from metadata |
| `components/CommandForm.test.ts` | disables submit while pending; shows ack/timeout result |
| `api/client.test.ts` | sends correct method/path/body, parses error envelopes |

### Integration / E2E

- **Playwright smoke** (`e2e/live.spec.ts`):
  1. `docker compose up` + start backend + serve UI build.
  2. A test MQTT publisher emits telemetry as the ESP would.
  3. UI shows the value in the card within 2 s.
  4. Start + stop recording; CSV export endpoint returns expected columns.
  5. Backend is restarted mid-test; UI reconnects, cards resume updating.

### Pipeline

- `ui` CI job runs unit + build.
- `e2e` CI job runs Playwright against a compose stack.

### Done when

- Architecture Phase 3 DoD passes (recording end-to-end + reconnect resilience).

---

## Phase 4 — Commands (`set_sample_interval`)

Goal: validated, deduplicated, timeout-aware command path.

### Steps

1. **`commands/registry.ts`**: single source of truth for command types,
   timeouts, parameter schema (Zod).
2. **`commands/dispatcher.ts`**: validate against registry, generate `cmd_id`,
   persist pending, publish to MQTT QoS 1.
3. **`commands/timeout.ts`**: background loop marks stale commands `timed_out`.
4. **Firmware**: enforce same registry conceptually (whitelist, range check),
   ack with `accepted` then `completed` for `set_sample_interval`.
5. **UI**: `CommandForm` for `set_sample_interval`, shows pending → ack/timeout.

### Unit tests

- Already covered above for dispatcher, timeout, ack, CommandForm.
- Add **fault-injection tests**:
  - publish two commands with the same `cmd_id` from the test → firmware applies
    once, second ack is `duplicate`.
  - simulate ESP offline → backend marks `timed_out` after registry timeout;
    a late ack is recorded but flagged "after timeout".

### Integration

- Round-trip with real broker + stub-firmware.
- Reset backend while command is in flight; on restart, the pending row is
  loaded and the timeout loop still trips.

### Done when

- Architecture Phase 4 DoD passes.

---

## Phase 5 — Resilience hardening + Expansion hooks

Steps and tests are smaller and additive:

1. **Reconnect jitter** verified by deterministic time mocking in `ws.test.ts`.
2. **Metadata regression** test confirmed in `metadata.test.ts` and adds a UI
   banner via `device.ts` store.
3. **Disk-full / Influx-down** chaos test: stop InfluxDB while backend is
   running; assert backend buffers a small bounded queue, drops oldest with a
   warning event, recovers when Influx returns.
4. **CAN ack semantics**: `sent` ack mapped in dispatcher + UI.
5. **Documentation**: `docs/firmware-release.md`, `docs/runbook.md`,
   `docs/mosquitto-setup.md`.

---

## Cross-cutting tests

### Static analysis

- `eslint` + `tsc --noEmit` in backend and UI.
- `clang-format` check on firmware (optional).

### Contract tests

- `types/api.ts` is shared (or mirrored) between backend and UI; a CI step diffs
  the two and fails on drift.
- A **golden line-protocol** fixture file makes it impossible to silently change
  Influx schema.

### Chaos / resilience matrix

| Scenario | Expected |
| --- | --- |
| Broker restart | ESP + backend reconnect; retained meta replays |
| Backend restart | UI WS reconnects with jitter; pending commands still reaped |
| Influx down 30 s | backend buffers, then flushes; warning event recorded |
| Wi-Fi drop on ESP | resumes within 30 s, no manual reset |
| Lower `metadata_version` | warning event, cache replaced |
| Duplicate `cmd_id` | applied once, second ack `duplicate` |

Each row corresponds to an integration test and is gated in CI.

---

## Order of execution

1. Phase 0 in full, including CI scaffolding.
2. Phase 1 firmware unit tests **before** the firmware rewrite (TDD where
   practical).
3. Phase 2 backend with Testcontainers.
4. Phase 3 UI.
5. Phase 4 commands.
6. Phase 5 hardening + docs.

Do not move to the next phase until the previous phase's DoD (architecture) and
its test matrix are green.

---

## Phase 6 — End-to-end dummy run (ESP32 simulator)

Goal: prove the full pipeline (MQTT → backend → InfluxDB → Grafana → UI) works
without hardware, using a simulator that speaks the **exact same protocol** as
the firmware.

### Steps

1. **`tools/simulator/`** Node script (`sim.ts`):
   - Connects to MQTT with LWT `bench/{device_id}/status` retained `offline`.
   - On connect, publishes retained `status` `online` and retained `meta` per
     `architecture.md` §Metadata.
   - Publishes telemetry at `sample_interval_ms` (default 500 ms) with a sine
     wave + noise on `current_a` and slow drift on `chip_temp_c`.
   - Increments `seq`, generates a fresh `boot_id` (UUIDv4) per run.
   - Subscribes `bench/{device_id}/cmd`, validates and dedupes by `cmd_id`,
     handles `set_sample_interval` and acks `accepted` then `completed`.
   - CLI flags: `--device-id`, `--mqtt-url`, `--interval-ms`, `--fault` (inject
     saturated quality codes), `--drop` (simulate Wi-Fi drop for N seconds).
2. **`npm run sim`** in repo root via a tiny workspace script.
3. **End-to-end checklist** (manual, scripted):
   - `docker compose up -d`
   - `npm --workspace backend run dev`
   - `npm --workspace ui run dev`
   - `npm run sim`
   - Open <http://localhost:5173>: live cards update, Grafana panel plots.
   - `--drop 20`: simulator goes offline, status flips, recovers and replays
     retained meta.
   - From the UI, send `set_sample_interval=200`: simulator acks, telemetry
     cadence visibly speeds up.
   - Start a recording, wait 10 s, stop, hit CSV export, confirm rows.
4. **Automated smoke** (`tools/simulator/test/e2e.test.ts`): boots compose +
   backend + sim in CI for 60 s, then asserts:
   - InfluxDB has > 60 `bench_sample` points for `bench-sim-01`.
   - SQLite recording row exists for the started/stopped session.
   - One `cmd_id` round-trip resolves to `completed`.
   - Duplicate `cmd_id` resolves to `duplicate`.

### Tests

| File | Test |
| --- | --- |
| `tools/simulator/sim.test.ts` | telemetry payload matches Zod schema shared with backend; quality codes are integers |
| `tools/simulator/sim.test.ts` | `--fault saturated` flips `current_a_quality` to `1` |
| `tools/simulator/sim.test.ts` | dedupe: same `cmd_id` twice → second ack is `duplicate` |
| `tools/simulator/test/e2e.test.ts` | full stack: 60 s run produces points + recording + command round-trip |

### Done when

- One operator command (`npm run sim`) plus the running stack reproduces every
  Phase 1–4 DoD without any ESP hardware.
- The same simulator also gates the broker-config and retained-message tests
  from Phase 1 in CI.
