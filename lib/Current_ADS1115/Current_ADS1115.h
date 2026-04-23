#pragma once

#include <Adafruit_ADS1X15.h>
#include <Wire.h>

class CurrentADS1115 {
 public:
  CurrentADS1115();

  bool begin(TwoWire& wire);
  bool update();

  float currentAmps() const;
  float shuntMilliVolts() const;
  int16_t rawCounts() const;
  bool saturated() const;

 private:
  Adafruit_ADS1115 ads_;
  float current_amps_;
  float shunt_millivolts_;
  int16_t raw_counts_;
  bool saturated_;
};
