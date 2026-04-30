# test-bench

ESP32 bench telemetry stack. No Docker, no external time-series DB, no Grafana —
just a Node backend with an embedded MQTT broker, a Svelte UI, a hardware-less
simulator, and a PlatformIO firmware project.

> Start with [`docs/notes.md`](docs/notes.md) — short tour of the moving
> parts, gotchas, and where to make common changes. Then dive into
> [`docs/architecture.md`](docs/architecture.md) for the deep details.

```
firmware/      PlatformIO project (ESP32-S3 + ADS1115)
backend/       Node + Fastify + SQLite + embedded MQTT broker
ui/            Svelte + Vite (live readings, recordings, CSV export, commands)
simulator/     hardware-less device simulator (Node)
e2e/           in-process broker + backend + sim test harness
docs/          architecture, wiring, work plan, runbook, protocol
```

The backend embeds an MQTT broker (Aedes), so devices and the simulator both
connect to `mqtt://<host>:1883` without any extra service. Recorded sessions
live in an in-memory ring buffer and are exported as CSV.

## Quick start (no Docker, no hardware)

```powershell
npm install
npm run dev
```

This boots the backend (with embedded broker on `:1883`), the simulator, and
the Vite dev server. Open <http://localhost:5173>.

## Production-style single port

```powershell
npm run build
npm start
```

Open <http://localhost:3000>. The Fastify server serves the UI, the API, the
WebSocket stream, and runs the embedded broker — one process, one port for
HTTP, one port for MQTT.

## Tests

```powershell
npm test                # backend + ui + simulator unit tests
npm run test:e2e        # in-process broker + backend + sim, asserts roundtrip
npm run test:firmware   # PlatformIO native unit tests (requires PlatformIO)
```

## Connect a real ESP32

1. Copy `firmware/secrets.example.json` to `firmware/secrets.json` and fill in
   your Wi-Fi SSID/password, the laptop/server IP that runs the backend
   (`mqtt://<pc-ip>:1883`), and a `device_id`. `secrets.json` is gitignored.
   The PlatformIO pre-build hook (`firmware/scripts/secrets_to_defines.py`)
   bakes those values into the binary so the board self-provisions NVS on
   first boot — no serial provisioning step required.
2. Build & upload:

   ```powershell
   pio run --project-dir firmware -t upload
   ```

3. Run backend + UI without the simulator (so the live readings come from
   the real board, not synthetic data):

   ```powershell
   npm run dev:real
   ```

   Open <http://localhost:5173>. The board appears in the sidebar as soon as
   its retained `online` status reaches the embedded broker.

If you don't want compile-time secrets, leave `secrets.json` absent and the
firmware will wait for a `PROVISION {json}` line on the serial console
(`firmware/scripts/provision.ps1` is a helper for this; it works reliably on
boards with a CH340/CH343 USB-UART bridge).
