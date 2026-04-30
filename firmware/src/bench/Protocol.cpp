#include "Protocol.h"

#include <ArduinoJson.h>
#include <cmath>
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
    if (std::isnan(readings[i].value)) continue;  // NaN → skip; JSON has no NaN
    r[readings[i].key] = readings[i].value;
    q[readings[i].key] = readings[i].quality;
  }
  size_t written = serializeJson(doc, out, out_len);
  if (written == 0 || written >= out_len) return 0;
  return written;
}

size_t buildStatusJson(char* out, size_t out_len,
                       const char* device_id,
                       const char* boot_id,
                       bool online,
                       const char* fw_version,
                       uint32_t sample_interval_ms) {
  JsonDocument doc;
  doc["v"] = 1;
  doc["device_id"] = device_id;
  doc["boot_id"] = boot_id;
  doc["state"] = online ? "online" : "offline";
  if (fw_version && *fw_version) doc["fw"] = fw_version;
  if (sample_interval_ms > 0) doc["sample_interval_ms"] = sample_interval_ms;
  size_t written = serializeJson(doc, out, out_len);
  if (written == 0 || written >= out_len) return 0;
  return written;
}

size_t buildMetadataJson(char* out, size_t out_len,
                         const char* device_id,
                         uint32_t metadata_version,
                         const ChannelMeta* channels, size_t n_channels,
                         const QualityCode* qcodes, size_t n_qcodes) {
  JsonDocument doc;
  doc["v"] = 1;
  doc["device_id"] = device_id;
  doc["metadata_version"] = metadata_version;
  JsonArray arr = doc["channels"].to<JsonArray>();
  for (size_t i = 0; i < n_channels; ++i) {
    const ChannelMeta& ch = channels[i];
    JsonObject c = arr.add<JsonObject>();
    c["key"] = ch.key;
    c["label"] = ch.label;
    c["unit"] = ch.unit;
    c["kind"] = ch.kind;
    if (ch.precision >= 0) c["precision"] = ch.precision;
    c["recordable"] = ch.recordable;
    c["chartable"] = ch.chartable;
  }
  if (n_qcodes > 0 && qcodes) {
    JsonObject qobj = doc["quality_codes"].to<JsonObject>();
    for (size_t i = 0; i < n_qcodes; ++i) {
      char code_str[8];
      snprintf(code_str, sizeof(code_str), "%d", qcodes[i].code);
      qobj[qcodes[i].channel_key][code_str] = qcodes[i].label;
    }
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
