# Bench Runbook

## Bring up the stack (no Docker, recommended)

```powershell
npm install
npm run dev
```

Backend embeds an MQTT broker on `:1883`. Open <http://localhost:5173>. Vite
proxies `/api` and `/ws` to the backend on port 3000. The simulator publishes
as `bench-sim-01`.

To run the production binary the same way (single HTTP port, embedded broker):

```powershell
npm run build
npm start
```

Open <http://localhost:3000>.

## Use an external MQTT broker

Set `EMBED_BROKER=false` and `MQTT_URL=mqtt://host:port` in `backend/.env`,
then `npm run dev`. Devices and the simulator should be pointed at the same
broker URL.

## Reset all state

```powershell
Remove-Item -Recurse -Force backend\data
```

## Watch device traffic

The UI sidebar shows online/offline state and last-seen. For raw inspection
when using an external broker, use any MQTT client subscribed to `bench/#`.

## Recording + export

1. Pick a device in the sidebar.
2. Hit the green **Start recording** button in the header (or the Recordings
   panel).
3. Hit **Stop recording**. The row appears in the Recordings table with a
   sample count and an **Export CSV** link.

Recordings live in an in-memory ring buffer (60k samples per recording) and are
not persisted across backend restarts.
