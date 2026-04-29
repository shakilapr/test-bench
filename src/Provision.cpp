#include "Provision.h"

namespace {
constexpr const char* kNs = "bench";
}

bool Provision::load() {
  prefs_.begin(kNs, /*readOnly=*/true);
  device_id_ = prefs_.getString("device_id", "");
  wifi_ssid_ = prefs_.getString("wifi_ssid", "");
  wifi_pass_ = prefs_.getString("wifi_pass", "");
  mqtt_url_  = prefs_.getString("mqtt_url", "");
  mqtt_user_ = prefs_.getString("mqtt_user", "");
  mqtt_pass_ = prefs_.getString("mqtt_pass", "");
  prefs_.end();
  complete_ = device_id_.length() && wifi_ssid_.length() && mqtt_url_.length();
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
