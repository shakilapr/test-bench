#pragma once

// Validates command params against the firmware's local registry. Mirrors the
// backend registry but the firmware is the source of truth for what it can
// actually execute.

#include <ArduinoJson.h>
#include <string.h>

namespace bench {

struct ValidationResult {
  bool ok;
  const char* error;
};

inline ValidationResult validateCommandParams(const char* type, JsonVariantConst params) {
  if (strcmp(type, "set_sample_interval") == 0) {
    if (!params["interval_ms"].is<int>()) {
      return {false, "interval_ms must be a number"};
    }
    int v = params["interval_ms"].as<int>();
    if (v < 100 || v > 10000) return {false, "interval_ms out of range"};
    return {true, nullptr};
  }
  return {false, "unknown command type"};
}

}  // namespace bench
