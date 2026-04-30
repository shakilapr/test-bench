#include "Provision.h"

#include <ArduinoJson.h>

namespace {
constexpr const char* kNs = "bench";
constexpr const char* kProvisionPrefix = "PROVISION ";
}

bool Provision::load() {
  prefs_.begin(kNs, /*readOnly=*/true);
  device_id_ = prefs_.getString("device_id", "");
  wifi_ssid_ = prefs_.getString("wifi_ssid", "");
  wifi_pass_ = prefs_.getString("wifi_pass", "");
  mqtt_url_  = prefs_.getString("mqtt_url", "");
  mqtt_user_ = prefs_.getString("mqtt_user", "");
  mqtt_pass_ = prefs_.getString("mqtt_pass", "");
  ap_pass_   = prefs_.getString("ap_pass", "");
  prefs_.end();
  // device_id and mqtt_url are mandatory. wifi_ssid is optional: without it
  // we run AP-only and expect the operator to attach a laptop to the AP.
  complete_ = device_id_.length() && mqtt_url_.length();
  return complete_;
}

bool Provision::save(const String& device_id, const String& ssid, const String& pass,
                     const String& mqtt_url, const String& mqtt_user, const String& mqtt_pass) {
  prefs_.begin(kNs, /*readOnly=*/false);
  prefs_.putString("device_id", device_id);
  prefs_.putString("wifi_ssid", ssid);
  prefs_.putString("wifi_pass", pass);
  prefs_.putString("mqtt_url",  mqtt_url);
  prefs_.putString("mqtt_user", mqtt_user);
  prefs_.putString("mqtt_pass", mqtt_pass);
  prefs_.end();
  return load();
}

bool Provision::pollSerial() {
  if (!Serial.available()) return false;
  String line = Serial.readStringUntil('\n');
  line.trim();
  if (line.length() == 0) return false;
  if (!line.startsWith(kProvisionPrefix)) {
    Serial.println("[prov] ignoring non-provisioning input");
    return true;
  }
  String payload = line.substring(strlen(kProvisionPrefix));

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.printf("[prov] bad JSON: %s\n", err.c_str());
    return true;
  }

  // Merge with existing values so partial provisioning works.
  prefs_.begin(kNs, /*readOnly=*/false);
  auto put = [&](const char* key, const char* json_key) {
    if (doc[json_key].is<const char*>()) {
      prefs_.putString(key, (const char*)doc[json_key]);
    }
  };
  put("device_id", "device_id");
  put("wifi_ssid", "wifi_ssid");
  put("wifi_pass", "wifi_pass");
  put("mqtt_url",  "mqtt_url");
  put("mqtt_user", "mqtt_user");
  put("mqtt_pass", "mqtt_pass");
  put("ap_pass",   "ap_pass");
  prefs_.end();

  Serial.println("[prov] saved, rebooting");
  delay(100);
  ESP.restart();
  return true;
}
