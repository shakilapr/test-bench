#pragma once

#include <Arduino.h>

// Per-boot mutable runtime state. boot_id is regenerated on every cold boot
// so the backend can detect resets. sample_interval_ms can be changed at runtime
// by a command and is persisted across reboots.
class DeviceState {
 public:
  void initialize();
  uint32_t sampleIntervalMs() const { return sample_interval_ms_; }
  void setSampleIntervalMs(uint32_t v);
  const String& bootId() const { return boot_id_; }

 private:
  String generateBootId() const;
  String boot_id_;
  uint32_t sample_interval_ms_ = 500;
};
