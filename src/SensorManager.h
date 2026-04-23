#pragma once

#include <Arduino.h>
#include <Wire.h>

#include "Current_ADS1115.h"

struct TelemetrySample {
  float current_amps = 0.0f;
  float chip_temp_c = NAN;
  float shunt_millivolts = 0.0f;
  int16_t raw_counts = 0;
  bool ads_saturated = false;
  bool ads_ok = false;
  bool temp_ok = false;
};

class SensorManager {
 public:
  SensorManager();

  bool begin(TwoWire& wire);
  bool update();
  const TelemetrySample& sample() const;

 private:
  bool beginChipTemperature();
  bool readChipTemperature(float* out_celsius);

  CurrentADS1115 current_sensor_;
  TelemetrySample sample_;
  void* temp_handle_;
  bool temp_started_;
};
