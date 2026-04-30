# Bench Simulator

A Node script that pretends to be an ESP32 bench node so the rest of the stack
(backend, UI) can be tested end-to-end without hardware. It speaks the same
MQTT protocol as the firmware target.

## Run

From the repo root, after `npm install`:

```powershell
npm run dev
```

This starts the backend (with the embedded MQTT broker), the simulator, and
the UI dev server in one shell.

To run only the simulator against an existing broker:

```powershell
cd simulator
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

## Tests

```powershell
npm test
```

Unit tests cover payload shapes and command parsing.

