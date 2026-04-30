# test-bench

ESP32 bench telemetry stack: firmware, backend, UI, simulator. The repository
is an npm workspace plus a PlatformIO subproject.

```
firmware/      PlatformIO project (ESP32-S3 + ADS1115)
backend/       Node.js + Fastify + SQLite + MQTT + Influx
ui/            Svelte + Vite
simulator/     hardware-less device simulator (Node)
e2e/           in-process broker + backend + sim test harness
chaos/         resilience checks against a live stack
infra/         optional Docker compose (Mosquitto + InfluxDB + Grafana)
docs/          architecture, wiring, work-plan, runbook, protocol
```

## Quick start (no Docker, no hardware)

```powershell
npm install
npm run dev
```

This boots the backend with an in-process MQTT broker, a no-op Influx writer
(so writes don't error against an unreachable Influx), the simulator, and the
Vite dev server. Open <http://localhost:5173>.

## Run the tests

```powershell
npm test                # backend + ui + simulator unit tests
npm run test:e2e        # in-process broker + backend + sim, asserts roundtrip
npm run test:firmware   # PlatformIO native unit tests (requires PlatformIO)
```

## Real stack (with Docker)

```powershell
docker compose -f infra/docker-compose.dev.yml up -d
npm --workspace backend run dev      # talks to Mosquitto + Influx
npm --workspace simulator run sim
npm --workspace ui run dev
```

See `docs/runbook.md` for more.
