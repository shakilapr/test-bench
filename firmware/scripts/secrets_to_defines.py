"""PlatformIO pre-build hook: reads firmware/secrets.json and exposes the
fields as compile-time -D macros so the firmware can self-provision NVS on
first boot without needing a working serial channel.

secrets.json is gitignored. Missing file -> no defaults -> firmware falls
back to runtime serial provisioning as before.
"""
import json
import os

Import("env")  # type: ignore  # provided by PlatformIO

secrets_path = os.path.join(env["PROJECT_DIR"], "secrets.json")
if not os.path.isfile(secrets_path):
    print("[secrets_to_defines] no secrets.json, skipping")
else:
    with open(secrets_path, "r", encoding="utf-8") as fh:
        data = json.load(fh)

    def _quote(value: str) -> str:
        return '\\"' + str(value).replace('\\', '\\\\').replace('"', '\\"') + '\\"'

    mapping = {
        "device_id": "BUILD_DEVICE_ID",
        "wifi_ssid": "BUILD_WIFI_SSID",
        "wifi_pass": "BUILD_WIFI_PASS",
        "mqtt_url":  "BUILD_MQTT_URL",
        "mqtt_user": "BUILD_MQTT_USER",
        "mqtt_pass": "BUILD_MQTT_PASS",
        "ap_pass":   "BUILD_AP_PASS",
    }
    flags = []
    for json_key, macro in mapping.items():
        if json_key in data and data[json_key] is not None:
            flags.append(f"-D{macro}={_quote(data[json_key])}")
    if flags:
        env.Append(BUILD_FLAGS=flags)
        print(f"[secrets_to_defines] injected {len(flags)} build flags from secrets.json")
