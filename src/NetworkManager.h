#pragma once

#include <WiFi.h>

#include "SensorManager.h"

class NetworkManager {
 public:
  NetworkManager();

  bool begin();
  void loop();
  void publishTelemetry(const TelemetrySample& sample);

 private:
  void handleClient(WiFiClient client);
  void handleRoot(WiFiClient& client);
  void handleEvents(WiFiClient& client);
  void handleNotFound(WiFiClient& client);
  void discardHeaders(WiFiClient& client);

  WiFiServer server_;
  WiFiClient event_client_;
  bool event_client_connected_;
};
