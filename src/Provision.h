#pragma once

#include <Arduino.h>
#include <Preferences.h>

// Reads/writes Wi-Fi + MQTT + device_id from NVS. Secrets never live in
// Config.h or in source control. If NVS is empty on boot the device falls
// back to a SoftAP captive page (provisioning UI) -- not implemented as part
// of MVP; if absent, the device prints instructions and halts.
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

  bool save(const String& device_id, const String& ssid, const String& pass,
            const String& mqtt_url, const String& mqtt_user, const String& mqtt_pass);

 private:
  Preferences prefs_;
  bool complete_ = false;
  String device_id_;
  String wifi_ssid_;
  String wifi_pass_;
  String mqtt_url_;
  String mqtt_user_;
  String mqtt_pass_;
};
