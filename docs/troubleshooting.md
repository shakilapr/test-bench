# Troubleshooting

## "Device offline" in UI

1. `docker logs bench-mosquitto` -- check broker is up.
2. `docker exec -it bench-mosquitto mosquitto_sub -t 'bench/#' -v` -- watch for
   any traffic from the device.
3. Confirm the device's NVS provisioning matches the broker host/port.
4. If you see the retained `online:false` LWT but no follow-up `online:true`,
   the device is reaching the broker but disconnecting before publishing
   status -- check Wi-Fi RSSI.

## InfluxDB has no points

1. `curl http://localhost:8086/health`.
2. Confirm `INFLUX_TOKEN`, `INFLUX_ORG`, `INFLUX_BUCKET` in `backend/.env`.
3. Tail backend logs for `influx write failed`.
4. Verify Grafana data source provisioning under Settings -> Data sources.

## Commands stuck in `issued`

The backend marks a command `timed_out` after 5 s if no terminal ack arrives.
If you see commands stuck:

1. Confirm device is subscribed: broker logs should show `Sending PUBLISH to ...`.
2. Confirm dispatcher saw the ack: backend log line `command <id> -> <status>`.
3. Re-issue the command -- the device dedupe ring keeps the last 16 ids and
   will return `duplicate` for a re-send of the same id.

## UI shows blank Grafana panel

Open the iframe URL directly in a new tab. If Grafana asks for login,
anonymous access provisioning failed; recheck `infra/grafana/provisioning`.
