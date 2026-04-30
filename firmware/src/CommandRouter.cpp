#include "CommandRouter.h"

#include <ArduinoJson.h>
#include <string.h>

#include "bench/CommandRegistry.h"
#include "bench/Protocol.h"

void CommandRouter::begin() {
  net_.onCommand([this](const char* topic, const uint8_t* payload, size_t len) {
    onMessage(topic, payload, len);
  });
}

void CommandRouter::sendAck(const char* cmd_id, const char* status, const char* error) {
  JsonDocument doc;
  doc["v"] = 1;
  doc["device_id"] = net_.deviceId();
  doc["cmd_id"] = cmd_id;
  doc["status"] = status;
  if (error) doc["error"] = error;
  char buf[256];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  if (n > 0) net_.publishAck(buf, n);
}

void CommandRouter::onMessage(const char* /*topic*/, const uint8_t* payload, size_t len) {
  JsonDocument doc;
  bench::CommandIn in = bench::parseCommand(doc, (const char*)payload, len);
  if (!in.ok) {
    // Cannot ack without cmd_id -- log only.
    return;
  }
  if (dedupe_.seen(in.cmd_id)) {
    sendAck(in.cmd_id, "duplicate");
    return;
  }
  dedupe_.record(in.cmd_id);

  sendAck(in.cmd_id, "accepted");

  JsonVariantConst params = doc["params"];
  bench::ValidationResult v = bench::validateCommandParams(in.type, params);
  if (!v.ok) { sendAck(in.cmd_id, "rejected", v.error); return; }

  handle(in.cmd_id, in.type, params);
}

void CommandRouter::handle(const char* cmd_id, const char* type, JsonVariantConst params) {
  if (strcmp(type, "set_sample_interval") == 0) {
    int interval = params["interval_ms"].as<int>();
    state_.setSampleIntervalMs((uint32_t)interval);
    sendAck(cmd_id, "completed");
    return;
  }
  sendAck(cmd_id, "rejected", "unknown command type");
}
