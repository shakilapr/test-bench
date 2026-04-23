#pragma once

#include <stdint.h>

namespace Config {

constexpr uint8_t kI2cSdaPin = 8;
constexpr uint8_t kI2cSclPin = 9;
constexpr uint8_t kAds1115Address = 0x48;

// Gain: GAIN_SIXTEEN (±0.256 V) suits the 75 mV full-scale shunt.
// Rate: 128 SPS default. Both are set inside Current_ADS1115::begin().
constexpr uint16_t kTelemetryIntervalMs = 500;

constexpr const char* kApSsid = "Telemetry";
constexpr const char* kApPassword = "password";
constexpr const char* kMdnsHostname = "bench";
constexpr bool kEnableMdns = true;

}  // namespace Config
