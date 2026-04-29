#pragma once

#include <ArduinoJson.h>

#include "DeviceState.h"
#include "NetworkManager.h"
#include "bench/CmdDedupe.h"
#include "Config.h"

class CommandRouter {
 public:
  CommandRouter(NetworkManager& net, DeviceState& state) : net_(net), state_(state) {}

  void begin();
  // Called from MQTT callback in NetworkManager.
  void onMessage(const char* topic, const uint8_t* payload, size_t len);

 private:
  void sendAck(const char* cmd_id, const char* status, const char* error = nullptr);
  void handle(const char* cmd_id, const char* type, JsonVariantConst params);

  NetworkManager& net_;
  DeviceState& state_;
  bench::CmdDedupe<Config::kCmdDedupHistorySize> dedupe_;
};
