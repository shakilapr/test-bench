# Bench Simulator

A Node script that pretends to be an ESP32 bench node so the rest of the stack
(Mosquitto, backend, InfluxDB, Grafana, UI) can be tested end-to-end without
hardware. It implements the same MQTT protocol described in `architecture.md`.

## Run

```powershell
docker compose -f ..\..\infra\docker-compose.dev.yml up -d
cd tools\simulator
npm install
npm run sim
```

Defaults: `bench-sim-01` on `mqtt://localhost:1883`, 500 ms cadence.

## Useful flags

```powershell
# faster cadence
npm run sim -- --interval-ms 200

# inject saturated quality codes on current_a
npm run sim -- --fault saturated

# disconnect after 30 s for 20 s to test reconnect
npm run sim -- --drop-after 30 --drop-for 20
```

## Verify in the broker

```powershell
docker exec -it bench-mosquitto mosquitto_sub -t "bench/#" -v
```

Expect: retained `meta`, retained `online` status, telemetry every interval.
On Ctrl+C, retained status flips to `offline`.

## Tests

```powershell
npm test
```

Unit tests cover payload shapes and command parsing. End-to-end tests against
the full stack live in Phase 6 (`work-plan.md`).
