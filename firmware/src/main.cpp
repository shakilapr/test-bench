#include <Arduino.h>
#include <Wire.h>

#include "Config.h"
#include "DeviceState.h"
#include "NetworkManager.h"
#include "Provision.h"
#include "SensorManager.h"
#include "TelemetryPublisher.h"

namespace {

SensorManager sensor_manager;
NetworkManager net_manager;
DeviceState device_state;
Provision provision;  // moved out of setup() so it stays alive for loop()

// Constructor signature matching (net, state, sensors)
TelemetryPublisher telemetry_publisher(net_manager, device_state, sensor_manager);

unsigned long last_print_ms = 0;

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\nESP32 current-only test with MQTT Telemetry");

  // 1. Initialize I2C Bus & Scan
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

  // 2. Initialize Sensors
  bool ok = sensor_manager.begin(Wire);
  Serial.printf("[sensors] begin: ads_ok=%d temp_ok=%d rpm_ok=%d\n",
                sensor_manager.adsOk(), sensor_manager.tempOk(),
                sensor_manager.rpmOk());
  if (!ok) Serial.println("sensors: degraded");

  // 3. Load provisioning data from NVS, then initialize Network
  bool prov_ok = provision.load();
  Serial.printf("[prov] load complete=%d device_id=%s wifi_ssid=%s mqtt_url=%s\n",
                prov_ok, provision.deviceId().c_str(),
                provision.wifiSsid().c_str(), provision.mqttUrl().c_str());
  if (!prov_ok) {
    Serial.println("[prov] incomplete — send 'PROVISION {...}' over serial to configure");
  }

  net_manager.begin(provision, device_state.bootId());

  // 4. Publish initial MQTT Metadata
  telemetry_publisher.publishMetadata(1);
}

void loop() {
  // Allow re-provisioning over serial at any time (e.g. "PROVISION {...}")
  provision.pollSerial();

  // Keep Wi-Fi and MQTT connection active
  net_manager.loop();

  unsigned long now = millis();
  if (now - last_print_ms < Config::kDefaultSampleIntervalMs) {
    delay(5);
    return;
  }
  last_print_ms = now;

  // Update sensor readings
  sensor_manager.update();
  const TelemetrySample& sample = sensor_manager.sample();

  // Local Serial Print
  Serial.printf("Current: %.4f A  |  shunt_mV: %.3f  |  raw: %d  |  ads_ok=%d  saturated=%d  |  RPM: %.1f  rpm_ok=%d raw_pulses=%d\n",
                sample.current_amps, sample.shunt_millivolts,
                sample.raw_counts, sample.ads_ok, sample.ads_saturated,
                sample.motor_rpm, sample.rpm_ok, sample.rpm_raw_pulses);

  // Publish structured JSON telemetry to bench/<device_id>/telemetry
  bool published = telemetry_publisher.publishOnce();
  if (!published) {
    Serial.println("[MQTT] Telemetry publish failed or network disconnected");
  }

  // Also publish a plain-text line to bench/<device_id>/log
  char log_msg[256];
  snprintf(log_msg, sizeof(log_msg),
           "Current: %.4f A  |  shunt_mV: %.3f  |  raw: %d  |  ads_ok=%d  saturated=%d  |  RPM: %.1f  rpm_ok=%d raw_pulses=%d",
           sample.current_amps, sample.shunt_millivolts,
           sample.raw_counts, sample.ads_ok, sample.ads_saturated,
           sample.motor_rpm, sample.rpm_ok, sample.rpm_raw_pulses);
  net_manager.publishLog(log_msg, strlen(log_msg));
}    