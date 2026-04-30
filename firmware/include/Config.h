#pragma once

#include <stdint.h>

namespace Config {

constexpr uint8_t kI2cSdaPin = 12;
constexpr uint8_t kI2cSclPin = 17;
constexpr uint8_t kAds1115Address = 0x48;

// ADS gain GAIN_SIXTEEN (+/- 0.256 V) suits the 75 mV full-scale shunt.
constexpr uint16_t kDefaultSampleIntervalMs = 500;
constexpr uint16_t kMinSampleIntervalMs = 100;
constexpr uint16_t kMaxSampleIntervalMs = 10000;

// Provisioning is serial-only; firmware never serves an HTTP/captive UI.
constexpr const char* kMdnsHostname = "bench";
constexpr bool kEnableMdns = true;

// SoftAP is always on alongside STA so an operator can connect a laptop
// directly to the device on benches without a router. STA still drives
// telemetry whenever provisioned creds work; the AP is purely a fallback
// path. SSID is derived from device_id at runtime as `bench-<device_id>`.
// Password defaults to kSoftApPasswordDefault and can be overridden via
// the NVS key `ap_pass` (see Provision).
constexpr const char* kSoftApPasswordDefault = "benchsetup";
constexpr uint8_t     kSoftApChannel         = 6;
constexpr uint8_t     kSoftApMaxClients      = 4;

constexpr const char* kFirmwareVersion = "0.1.0";

constexpr uint8_t kCmdDedupHistorySize = 16;

// Connectivity backoff (Wi-Fi + MQTT). On every failed attempt we double the
// delay up to kReconnectMaxDelayMs and add a small jitter, so a fleet of
// devices coming back from a broker outage doesn't reconnect in lockstep.
constexpr uint32_t kReconnectInitialDelayMs = 1000;
constexpr uint32_t kReconnectMaxDelayMs     = 30000;
constexpr uint32_t kReconnectJitterMs       = 500;

// Software watchdog: if MQTT stays disconnected this long, reboot. Picks the
// device up from any state the runtime can't recover from (DHCP wedged, AP
// firmware bug, kernel panic in the radio stack).
constexpr uint32_t kConnectivityRebootMs = 10UL * 60UL * 1000UL;  // 10 min

}  // namespace Config

