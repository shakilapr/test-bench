#pragma once

#include <Arduino.h>
#include <Adafruit_ADS1X15.h>

namespace Config {

constexpr uint8_t kI2cSdaPin = 8;
constexpr uint8_t kI2cSclPin = 9;
constexpr uint8_t kAds1115Address = 0x48;

constexpr float kShuntMaxAmps = 200.0f;
constexpr float kShuntMaxMilliVolts = 75.0f;

constexpr adsGain_t kAdsGain = GAIN_SIXTEEN;
constexpr uint16_t kTelemetryIntervalMs = 500;

constexpr const char* kApSsid = "Telemetry";
constexpr const char* kApPassword = "password";
constexpr const char* kMdnsHostname = "bench";
constexpr bool kEnableMdns = true;

}  // namespace Config
