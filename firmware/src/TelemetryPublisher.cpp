#include "TelemetryPublisher.h"

#include <ArduinoJson.h>

#include "Config.h"
#include "bench/Protocol.h"

void TelemetryPublisher::publishMetadata(uint32_t metadata_version) {
  JsonDocument doc;
  doc["v"] = 1;
  doc["device_id"] = net_.deviceId();
  doc["fw_version"] = Config::kFirmwareVersion;
  doc["metadata_version"] = metadata_version;
  doc["sample_interval_ms"] = state_.sampleIntervalMs();
  JsonArray channels = doc["channels"].to<JsonArray>();
  {
    JsonObject c = channels.add<JsonObject>();
    c["key"] = "current_a"; c["unit"] = "A"; c["label"] = "Shunt current";
  }
  {
    JsonObject c = channels.add<JsonObject>();
    c["key"] = "chip_temp_c"; c["unit"] = "C"; c["label"] = "ADS chip temperature";
  }
  char buf[512];
  size_t n = serializeJson(doc, buf, sizeof(buf));
  if (n > 0) net_.publishMeta(buf, n);
}

bool TelemetryPublisher::publishOnce() {
  sensors_.update();
  const TelemetrySample& s = sensors_.sample();
  bench::Reading r[2];
  r[0] = {"current_a",  s.current_amps, s.ads_saturated ? 1 : (s.ads_ok ? 0 : 1)};
  r[1] = {"chip_temp_c", s.chip_temp_c,  s.temp_ok ? 0 : 1};

  char buf[512];
  size_t n = bench::buildTelemetryJson(buf, sizeof(buf),
                                       net_.deviceId().c_str(),
                                       state_.bootId().c_str(),
                                       seq_++, (uint32_t)millis(),
                                       r, 2);
  if (n == 0) return false;
  return net_.publishTelemetry(buf, n);
}
