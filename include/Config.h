#pragma once

#include <stdint.h>

namespace Config {

constexpr uint8_t kI2cSdaPin = 8;
constexpr uint8_t kI2cSclPin = 9;
constexpr uint8_t kAds1115Address = 0x48;

// ADS gain GAIN_SIXTEEN (+/- 0.256 V) suits the 75 mV full-scale shunt.
constexpr uint16_t kDefaultSampleIntervalMs = 500;
constexpr uint16_t kMinSampleIntervalMs = 100;
constexpr uint16_t kMaxSampleIntervalMs = 10000;

// Provisioning-only fallback SoftAP (used when NVS has no Wi-Fi creds).
constexpr const char* kProvisionApSsid = "BenchSetup";
constexpr const char* kMdnsHostname = "bench";
constexpr bool kEnableMdns = true;

constexpr const char* kFirmwareVersion = "0.1.0";

constexpr uint8_t kCmdDedupHistorySize = 16;

}  // namespace Config

