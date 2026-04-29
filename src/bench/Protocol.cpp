#include "Protocol.h"

#include <ArduinoJson.h>
#include <string.h>

namespace bench {

size_t buildTelemetryJson(char* out, size_t out_len,
                          const char* device_id,
                          const char* boot_id,
                          uint32_t seq,
                          uint32_t ms,
                          const Reading* readings, size_t n_readings) {
  JsonDocument doc;
  doc["v"] = 1;
  doc["device_id"] = device_id;
  doc["boot_id"] = boot_id;
  doc["seq"] = seq;
  doc["ms"] = ms;
  doc["time_synced"] = false;
  JsonObject r = doc["readings"].to<JsonObject>();
  JsonObject q = doc["quality"].to<JsonObject>();
  for (size_t i = 0; i < n_readings; ++i) {
    r[readings[i].key] = readings[i].value;
    q[readings[i].key] = readings[i].quality;
  }
  size_t written = serializeJson(doc, out, out_len);
  if (written == 0 || written >= out_len) return 0;
  return written;
}

CommandIn parseCommand(JsonDocument& doc, const char* json, size_t len) {
  CommandIn c{};
  c.ok = false;
  DeserializationError err = deserializeJson(doc, json, len);
  if (err) { c.error = "invalid_json"; return c; }
  if (!doc["v"].is<int>() || doc["v"].as<int>() != 1) { c.error = "unsupported_v"; return c; }
  const char* cmd_id = doc["cmd_id"];
  const char* type = doc["type"];
  if (!cmd_id || !*cmd_id) { c.error = "missing_cmd_id"; return c; }
  if (!type || !*type) { c.error = "missing_type"; return c; }
  strncpy(c.cmd_id, cmd_id, sizeof(c.cmd_id) - 1);
  strncpy(c.type, type, sizeof(c.type) - 1);
  c.ok = true;
  return c;
}

}  // namespace bench
