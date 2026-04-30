#pragma once

#include <Arduino.h>
#include <Preferences.h>

// Reads/writes Wi-Fi + MQTT + device_id from NVS. Secrets never live in
// Config.h or in source control. Provisioning is performed over the serial
// port (see tools/provisioning); the firmware never serves any HTTP/web
// interface of its own. The firmware also runs a SoftAP alongside STA so
// a laptop can attach directly to the device on benches without a router;
// the AP password may optionally be overridden via the NVS key `ap_pass`
// (otherwise Config::kSoftApPasswordDefault is used).
class Provision {
 public:
  bool load();
  bool isComplete() const { return complete_; }

  const String& deviceId() const { return device_id_; }
  const String& wifiSsid() const { return wifi_ssid_; }
  const String& wifiPass() const { return wifi_pass_; }
  const String& mqttUrl() const { return mqtt_url_; }
  const String& mqttUser() const { return mqtt_user_; }
  const String& mqttPass() const { return mqtt_pass_; }
  const String& apPass()   const { return ap_pass_; }

  bool save(const String& device_id, const String& ssid, const String& pass,
            const String& mqtt_url, const String& mqtt_user, const String& mqtt_pass);

  // Drains one line from Serial. If it's a `PROVISION {...}` JSON command,
  // persists the values and reboots. Returns true if a line was consumed.
  // Safe to call every loop iteration; non-blocking.
  bool pollSerial();

 private:
  Preferences prefs_;
  bool complete_ = false;
  String device_id_;
  String wifi_ssid_;
  String wifi_pass_;
  String mqtt_url_;
  String mqtt_user_;
  String mqtt_pass_;
  String ap_pass_;
};
