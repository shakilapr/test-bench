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

```sh
npm install
npm run dev
```

This boots the backend (with embedded broker on `:1883`), the simulator, and
the Vite dev server. Open <http://localhost:5173>.

If you switch the same checkout between Windows and Linux/WSL, reset native
Node packages before reinstalling on the new OS:

```sh
npm run deps:reset
npm install
npm run dev
```

That keeps platform-specific packages such as Rollup, esbuild, and
better-sqlite3 from reusing binaries built for the other OS.

## Production-style single port

```sh
npm run build
npm start
```

Open <http://localhost:3000>. The Fastify server serves the UI, the API, the
WebSocket stream, and runs the embedded broker — one process, one port for
HTTP, one port for MQTT.

## Tests

```sh
npm test                # backend + ui + simulator unit tests
npm run test:e2e        # in-process broker + backend + sim, asserts roundtrip
npm run test:firmware   # PlatformIO native unit tests (requires PlatformIO)
```

## Connect a real ESP32

1. Copy `firmware/secrets.example.json` to `firmware/secrets.json` and set:

   ```json
   {
     "device_id": "bench-01",
     "wifi_ssid": "NITRO",
     "wifi_pass": "11110000",
     "mqtt_url": "mqtt://<pc-ip>:1883"
   }
   ```

   Use the Linux/WSL host IP that runs the backend for `<pc-ip>`.
   `secrets.json` is gitignored. Wi-Fi reference:

   ```sh
   # Previous local values, kept only as a comment/reference:
   # wifi_ssid=BlackPearl
   # wifi_pass=98765432

   wifi_ssid=NITRO
   wifi_pass=11110000
   ```

   The PlatformIO pre-build hook
   (`firmware/scripts/secrets_to_defines.py`) bakes these values into the
   binary so the board self-provisions NVS on first boot.
2. Build and upload from Windows:

   ```powershell
   pio run --project-dir firmware -t upload
   ```

   The active PlatformIO serial settings are Windows ports:

   ```ini
   upload_port = COM5
   monitor_port = COM5
   ```

   If the board appears as another COM port, check it with
   `pio device list` and update `firmware/platformio.ini`.

   Linux still works. Leave the Windows ports active for this checkout, or
   temporarily switch the commented Linux settings in
   `firmware/platformio.ini` when flashing from Linux:

   ```ini
   ; upload_port = /dev/ttyUSB0
   ; monitor_port = /dev/ttyUSB0
   ```

   Linux upload command is still the same:

   ```sh
   # pio run --project-dir firmware -t upload
   ```

3. Run backend + UI without the simulator (so the live readings come from
   the real board, not synthetic data):

   ```sh
   npm run dev:real
   ```

   Open the real-device UI at <http://localhost:5173>. The backend listens on
   <http://localhost:3000>, and the embedded MQTT broker listens on `:1883`.
   The board appears in the sidebar as soon as its retained `online` status
   reaches the embedded broker.

If you don't want compile-time secrets, leave `secrets.json` absent and the
firmware will wait for a `PROVISION {json}` line on the serial console
(`firmware/scripts/provision.ps1` is a helper for this; it works reliably on
boards with a CH340/CH343 USB-UART bridge).
