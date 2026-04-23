#include <Arduino.h>
#include <Wire.h>

#include "Config.h"
#include "NetworkManager.h"
#include "SensorManager.h"

namespace {

SensorManager sensor_manager;
NetworkManager network_manager;
unsigned long last_publish_ms = 0;

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println("ESP32 telemetry boot");

  Wire.begin(Config::kI2cSdaPin, Config::kI2cSclPin);

  if (!sensor_manager.begin(Wire)) {
    Serial.println("Warning: no sensors initialized successfully");
  } else {
    Serial.println("Sensor manager initialized");
  }

  if (!network_manager.begin()) {
    Serial.println("Network manager failed to start");
  } else {
    Serial.println("Network manager initialized");
  }
}

void loop() {
  const unsigned long now = millis();
  if (now - last_publish_ms < Config::kTelemetryIntervalMs) {
    delay(10);
    return;
  }

  sensor_manager.update();
  network_manager.publishTelemetry(sensor_manager.sample());
  last_publish_ms = now;
}
