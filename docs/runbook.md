# Bench Runbook

## Bring up the stack (no Docker, recommended for development)

```powershell
npm install
npm run dev
```

Backend embeds an MQTT broker (`EMBED_BROKER=true`) and skips Influx writes
(`INFLUX_DISABLED=true`). Open <http://localhost:5173>. Vite proxies `/api`
and `/ws` to the backend on port 3000. The simulator publishes as
`bench-sim-01`.

To run the production binary the same way (single port, no Docker):

```powershell
npm run build
npm start
```

Open <http://localhost:3000>.

## Bring up the stack (Docker, full Influx + Grafana)

```powershell
docker compose -f infra/docker-compose.dev.yml up -d
npm --workspace backend run dev
npm --workspace simulator run sim
npm --workspace ui run dev
```

## Verify MQTT (Docker path only)

```powershell
docker exec -it bench-mosquitto mosquitto_sub -t "bench/#" -v
```

## Stop everything

```powershell
docker compose -f infra/docker-compose.dev.yml down
```

## Run the chaos harness

After the full Docker stack + simulator is up:

```powershell
cd chaos; npm run chaos
```

It restarts Mosquitto, then asserts the device returns online and a
command roundtrip still completes.

## Reset all state

```powershell
docker compose -f infra/docker-compose.dev.yml down -v
Remove-Item -Recurse -Force infra\data
Remove-Item -Recurse -Force backend\data
```
