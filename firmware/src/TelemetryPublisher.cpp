#include "TelemetryPublisher.h"

#include <ArduinoJson.h>

#include "Config.h"
#include "bench/Protocol.h"

void TelemetryPublisher::publishMetadata(uint32_t metadata_version) {
  bench::ChannelMeta channels[2] = {
    {"current_a",   "Shunt current",          "A", "measurement",
     /*precision=*/2, /*recordable=*/true, /*chartable=*/true},
    {"chip_temp_c", "Chip Temp",  "C", "health",
     /*precision=*/1, /*recordable=*/true, /*chartable=*/true},
  };
  // Quality code 1 = sensor not responding (ADS1115 not found on I2C).
  bench::QualityCode qcodes[1] = {
    {"current_a", 1, "sensor fault"},
  };
  char buf[640];
  size_t n = bench::buildMetadataJson(buf, sizeof(buf),
                                      net_.deviceId().c_str(),
                                      metadata_version,
                                      channels, 2,
                                      qcodes, 1);
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
