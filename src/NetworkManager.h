#pragma once

#include <ESPAsyncWebServer.h>

#include "SensorManager.h"

class NetworkManager {
 public:
  NetworkManager();

  bool begin();
  void publishTelemetry(const TelemetrySample& sample);

 private:
  AsyncWebServer server_;
  AsyncEventSource events_;
};
