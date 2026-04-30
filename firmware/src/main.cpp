#include <Arduino.h>
#include <Wire.h>

#include "Config.h"
#include "CommandRouter.h"
#include "DeviceState.h"
#include "NetworkManager.h"
#include "Provision.h"
#include "SensorManager.h"
#include "TelemetryPublisher.h"

namespace {

Provision provision;
DeviceState device_state;
SensorManager sensor_manager;
NetworkManager network_manager;
TelemetryPublisher* publisher = nullptr;
CommandRouter* router = nullptr;
unsigned long last_publish_ms = 0;
bool meta_published = false;

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\nESP32 telemetry boot");

  Wire.begin(Config::kI2cSdaPin, Config::kI2cSclPin);
  Serial.printf("[i2c] SDA=GPIO%d SCL=GPIO%d — scanning...\n",
                Config::kI2cSdaPin, Config::kI2cSclPin);
  {
    int found = 0;
    for (uint8_t addr = 1; addr < 127; addr++) {
      Wire.beginTransmission(addr);
      if (Wire.endTransmission() == 0) {
        Serial.printf("[i2c] device at 0x%02X\n", addr);
        found++;
      }
    }
    if (found == 0) Serial.println("[i2c] no devices found");
  }
  bool ok = sensor_manager.begin(Wire);
  Serial.printf("[sensors] begin: ads_ok=%d temp_ok=%d\n",
                sensor_manager.adsOk(), sensor_manager.tempOk());
  if (!ok) Serial.println("sensors: degraded");

  if (!provision.load()) {
    bool seeded = false;
#if defined(BUILD_DEVICE_ID) && defined(BUILD_MQTT_URL)
    Serial.println("NVS empty, seeding from build-time defaults (secrets.json)");
    String wifi_ssid;
    String wifi_pass;
    String mqtt_user;
    String mqtt_pass;
#ifdef BUILD_WIFI_SSID
    wifi_ssid = BUILD_WIFI_SSID;
#endif
#ifdef BUILD_WIFI_PASS
    wifi_pass = BUILD_WIFI_PASS;
#endif
#ifdef BUILD_MQTT_USER
    mqtt_user = BUILD_MQTT_USER;
#endif
#ifdef BUILD_MQTT_PASS
    mqtt_pass = BUILD_MQTT_PASS;
#endif
    seeded = provision.save(BUILD_DEVICE_ID, wifi_ssid, wifi_pass,
                            BUILD_MQTT_URL, mqtt_user, mqtt_pass);
#endif
    if (!seeded) {
      Serial.println("NVS not provisioned. Send a line over serial:");
      Serial.println("  PROVISION {\"device_id\":\"bench-01\",\"wifi_ssid\":\"...\",\"wifi_pass\":\"...\",\"mqtt_url\":\"mqtt://192.168.x.x:1883\"}");
      Serial.println("Waiting...");
      while (!provision.isComplete()) {
        provision.pollSerial();
        delay(50);
      }
    }
  }
  device_state.initialize();
  if (!network_manager.begin(provision, device_state.bootId())) {
    Serial.println("network: bad config"); return;
  }

  static TelemetryPublisher pub(network_manager, device_state, sensor_manager);
  static CommandRouter rt(network_manager, device_state);
  publisher = &pub;
  router = &rt;
  router->begin();
}

void loop() {
  provision.pollSerial();
  network_manager.loop();
  if (!network_manager.connected()) { delay(50); return; }
  if (!meta_published) {
    publisher->publishMetadata(/*metadata_version=*/2);
    meta_published = true;
  }

  unsigned long now = millis();
  if (now - last_publish_ms < device_state.sampleIntervalMs()) {
    delay(5);
    return;
  }
  last_publish_ms = now;
  publisher->publishOnce();
}
