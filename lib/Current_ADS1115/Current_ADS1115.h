#pragma once

#include <Adafruit_ADS1X15.h>
#include <Wire.h>

class CurrentADS1115 {
 public:
  CurrentADS1115();

  // address: I2C address of the ADS1115 (default 0x48).
  bool begin(TwoWire& wire, uint8_t address = 0x48);
  bool update();

  float currentAmps() const;
  float shuntMilliVolts() const;
  int16_t rawCounts() const;
  bool saturated() const;

 private:
  static constexpr float kShuntMaxAmps = 200.0f;
  static constexpr float kShuntMaxMilliVolts = 75.0f;

  Adafruit_ADS1115 ads_;
  float current_amps_;
  float shunt_millivolts_;
  int16_t raw_counts_;
  bool saturated_;
};
