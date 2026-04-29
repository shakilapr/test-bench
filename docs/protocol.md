# Protocol Reference

All payloads are UTF-8 JSON. Every frame carries `v: 1`. The backend rejects
unknown versions instead of silently coercing.

## Topics

| Topic | Direction | Retained | QoS |
|---|---|---|---|
| `bench/<device_id>/telemetry` | device -> server | no | 0 |
| `bench/<device_id>/status` | device -> server | yes | 1 |
| `bench/<device_id>/meta` | device -> server | yes | 1 |
| `bench/<device_id>/ack` | device -> server | no | 1 |
| `bench/<device_id>/cmd` | server -> device | no | 1 |

## Telemetry frame

```json
{
  "v": 1,
  "device_id": "bench-01",
  "boot_id": "ad33...",
  "seq": 1234,
  "ms": 56789,
  "time_synced": false,
  "readings": { "current_a": 1.42, "chip_temp_c": 31.0 },
  "quality":  { "current_a": 0,    "chip_temp_c": 0 }
}
```

Quality codes are integers: `0` ok, `1` saturated, `2` low_snr.

## Status frame (retained)

```json
{ "v": 1, "device_id": "bench-01", "online": true }
```

The MQTT Last Will is the same payload with `online: false`; the broker
publishes it automatically when the device drops.

## Metadata frame (retained)

```json
{
  "v": 1,
  "device_id": "bench-01",
  "fw_version": "0.1.0",
  "metadata_version": 1,
  "sample_interval_ms": 500,
  "channels": [
    { "key": "current_a",   "unit": "A", "label": "Shunt current" },
    { "key": "chip_temp_c", "unit": "C", "label": "ADS chip temp" }
  ]
}
```

The backend rejects metadata frames with a `metadata_version` lower than the
last value it has stored for the device and logs a warning. This protects
against accidental reflash with older firmware overwriting newer metadata.

## Command frame (server -> device)

```json
{
  "v": 1,
  "device_id": "bench-01",
  "cmd_id": "01J..ULID..",
  "type": "set_sample_interval",
  "params": { "interval_ms": 500 }
}
```

The device deduplicates by `cmd_id` (last 16 ids retained in a ring buffer)
so a backend retry after a missed ack will not execute twice; instead the
device replies with `status: duplicate`.

## Ack frame

```json
{
  "v": 1,
  "device_id": "bench-01",
  "cmd_id": "01J..ULID..",
  "status": "completed",
  "error": null
}
```

Status values:

| Status | Meaning |
|---|---|
| `accepted` | Frame parsed and queued |
| `sent` | CAN-only: frame transmitted on the bus (not necessarily accepted by the remote node) |
| `completed` | Local handler finished successfully |
| `rejected` | Validation failure (`error` populated) |
| `failed` | Handler errored (`error` populated) |
| `duplicate` | `cmd_id` already seen |

If the backend does not see a terminal status (`completed`/`rejected`/`failed`/`duplicate`)
within 5 seconds, it marks the command `timed_out` itself.
