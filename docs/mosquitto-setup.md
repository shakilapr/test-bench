# Mosquitto setup (dev)

The `infra/docker-compose.dev.yml` Mosquitto container reads
`infra/mosquitto/mosquitto.conf`. Defaults for MVP on a trusted bench network:

- Listener on 1883
- `allow_anonymous true`
- No password file, no ACL

For production this must be replaced with a `password_file` + `acl_file`. The
backend reads `MQTT_USERNAME` / `MQTT_PASSWORD` from `.env` (still empty for
MVP) so no code changes are required when auth is enabled.

## Adding auth later

```conf
listener 1883
allow_anonymous false
password_file /mosquitto/config/passwd
acl_file /mosquitto/config/acl
```

Generate `passwd`:

```powershell
docker exec -it bench-mosquitto mosquitto_passwd -c /mosquitto/config/passwd backend
docker exec -it bench-mosquitto mosquitto_passwd /mosquitto/config/passwd bench-01
docker restart bench-mosquitto
```

Then set `MQTT_USERNAME=backend` / `MQTT_PASSWORD=...` in `backend/.env` and
provision the device with matching `mqtt_user` / `mqtt_pass` via NVS.
