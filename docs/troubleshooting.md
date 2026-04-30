# Troubleshooting

## "Device offline" in UI

1. Confirm the embedded broker started — backend logs `[mqtt] embedded broker
   listening on :1883` on startup.
2. Confirm the simulator (or the device firmware) is configured for
   `mqtt://<backend-host>:1883`. The simulator picks this up via `MQTT_URL`.
3. If you see the retained `online:false` LWT but no follow-up `online:true`,
   the device is reaching the broker but disconnecting before publishing
   status — check Wi-Fi signal / power.

## UI says `○ offline` (websocket)

1. Confirm the backend is running on port 3000 and `/api/health` returns ok.
2. The vite proxy targets `127.0.0.1:3000` — Windows can resolve `localhost`
   to IPv6 first which fails against an IPv4-only server.

## Commands stuck in `issued`

The backend marks a command `timed_out` after 5 s if no terminal ack arrives.

1. Confirm the device is subscribed to its command topic.
2. Look for `command <id> -> <status>` in the backend log.
3. Re-issue the command — the device dedupe ring keeps the last 16 ids and
   will return `duplicate` for a re-send of the same id.

## CSV export is empty

Recordings buffer telemetry only while a recording is active. If the device
sent samples before you hit Start, those are not in the export. The buffer is
in-memory and resets on backend restart.
