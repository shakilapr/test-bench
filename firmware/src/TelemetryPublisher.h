#pragma once

#include <ArduinoJson.h>

#include "DeviceState.h"
#include "NetworkManager.h"
#include "SensorManager.h"

class TelemetryPublisher {
 public:
  TelemetryPublisher(NetworkManager& net, DeviceState& state, SensorManager& sensors)
      : net_(net), state_(state), sensors_(sensors) {}

  // Publish a v=1 metadata frame describing channels + schema, retained.
  void publishMetadata(uint32_t metadata_version);

  // Read sensors and publish a telemetry frame. Returns false if MQTT down.
  bool publishOnce();

 private:
  NetworkManager& net_;
  DeviceState& state_;
  SensorManager& sensors_;
  uint32_t seq_ = 0;
};
