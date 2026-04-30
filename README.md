# test-bench

ESP32 bench telemetry stack. No Docker, no external time-series DB, no Grafana —
just a Node backend with an embedded MQTT broker, a Svelte UI, a hardware-less
simulator, and a PlatformIO firmware project.

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

Flash the firmware in `firmware/` (PlatformIO). Provision Wi-Fi + MQTT broker
URL via NVS — point it at `mqtt://<your-pc-ip>:1883`. The board will appear in
the UI sidebar as soon as its retained `online` status arrives.
