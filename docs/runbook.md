# Bench Runbook

## Bring up the stack (dev)

```powershell
docker compose -f infra/docker-compose.dev.yml up -d
cd backend; npm install; npm run dev
# in another shell
cd ui; npm install; npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` and `/ws` to the backend on
port 3000.

## Bring up the stack (prod-like, single port)

```powershell
docker compose -f infra/docker-compose.dev.yml up -d
cd ui; npm run build
cd ../backend; npm run build
node dist\index.js
```

Open <http://localhost:3000>.

## Verify MQTT

```powershell
docker exec -it bench-mosquitto mosquitto_sub -t "bench/#" -v
```

## Stop everything

```powershell
docker compose -f infra/docker-compose.dev.yml down
```

## Run the chaos harness

After the full stack + simulator is up:

```powershell
cd tools\chaos; npm install; npm run chaos
```

It restarts Mosquitto, then asserts the device returns online and a
command roundtrip still completes.

## Reset all state

```powershell
docker compose -f infra/docker-compose.dev.yml down -v
Remove-Item -Recurse -Force infra\data
Remove-Item -Recurse -Force backend\data
```
