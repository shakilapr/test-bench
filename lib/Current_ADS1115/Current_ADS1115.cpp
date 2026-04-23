#include "Current_ADS1115.h"

#include <limits.h>

CurrentADS1115::CurrentADS1115()
    : current_amps_(0.0f),
      shunt_millivolts_(0.0f),
      raw_counts_(0),
      saturated_(false) {}

bool CurrentADS1115::begin(TwoWire& wire, uint8_t address) {
  if (!ads_.begin(address, &wire)) {
    return false;
  }

  ads_.setGain(GAIN_SIXTEEN);
  ads_.setDataRate(RATE_ADS1115_128SPS);
  return true;
}

bool CurrentADS1115::update() {
  raw_counts_ = ads_.readADC_Differential_0_1();
  saturated_ = (raw_counts_ == INT16_MAX || raw_counts_ == INT16_MIN);

  shunt_millivolts_ = ads_.computeVolts(raw_counts_) * 1000.0f;
  current_amps_ =
      (shunt_millivolts_ / kShuntMaxMilliVolts) * kShuntMaxAmps;
  return true;
}

float CurrentADS1115::currentAmps() const { return current_amps_; }

float CurrentADS1115::shuntMilliVolts() const { return shunt_millivolts_; }

int16_t CurrentADS1115::rawCounts() const { return raw_counts_; }

bool CurrentADS1115::saturated() const { return saturated_; }
