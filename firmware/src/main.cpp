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
  if (!sensor_manager.begin(Wire)) Serial.println("sensors: degraded");

  if (!provision.load()) {
    Serial.println("NVS not provisioned. Set device_id/wifi_ssid/wifi_pass/mqtt_url via serial provisioning tool.");
    return;
  }
  device_state.initialize();
  if (!network_manager.begin(provision)) {
    Serial.println("network: bad config"); return;
  }

  static TelemetryPublisher pub(network_manager, device_state, sensor_manager);
  static CommandRouter rt(network_manager, device_state);
  publisher = &pub;
  router = &rt;
  router->begin();
}

void loop() {
  network_manager.loop();
  if (!network_manager.connected()) { delay(50); return; }
  if (!meta_published) {
    publisher->publishMetadata(/*metadata_version=*/1);
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
