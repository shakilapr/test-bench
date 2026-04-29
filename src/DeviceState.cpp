#include "DeviceState.h"

#include <Preferences.h>
#include <esp_random.h>

#include "Config.h"

namespace {
constexpr const char* kNs = "bench_state";
}

void DeviceState::initialize() {
  boot_id_ = generateBootId();
  Preferences prefs;
  prefs.begin(kNs, /*readOnly=*/true);
  sample_interval_ms_ = prefs.getUInt("sample_ms", Config::kDefaultSampleIntervalMs);
  prefs.end();
  if (sample_interval_ms_ < Config::kMinSampleIntervalMs ||
      sample_interval_ms_ > Config::kMaxSampleIntervalMs) {
    sample_interval_ms_ = Config::kDefaultSampleIntervalMs;
  }
}

void DeviceState::setSampleIntervalMs(uint32_t v) {
  if (v < Config::kMinSampleIntervalMs || v > Config::kMaxSampleIntervalMs) return;
  sample_interval_ms_ = v;
  Preferences prefs;
  prefs.begin(kNs, /*readOnly=*/false);
  prefs.putUInt("sample_ms", v);
  prefs.end();
}

String DeviceState::generateBootId() const {
  char buf[37];
  uint32_t a = esp_random();
  uint32_t b = esp_random();
  uint32_t c = esp_random();
  uint32_t d = esp_random();
  snprintf(buf, sizeof(buf), "%08lx-%04lx-%04lx-%04lx-%04lx%08lx",
           (unsigned long)a,
           (unsigned long)((b >> 16) & 0xFFFF),
           (unsigned long)((b      ) & 0xFFFF),
           (unsigned long)((c >> 16) & 0xFFFF),
           (unsigned long)((c      ) & 0xFFFF),
           (unsigned long)d);
  return String(buf);
}
