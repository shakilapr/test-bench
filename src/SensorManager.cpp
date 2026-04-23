#include "SensorManager.h"

#include "Config.h"

#if __has_include(<driver/temperature_sensor.h>)
#include <driver/temperature_sensor.h>
#define HAS_NEW_TEMP_SENSOR_API 1
#elif __has_include(<driver/temp_sensor.h>)
#include <driver/temp_sensor.h>
#define HAS_OLD_TEMP_SENSOR_API 1
#endif

SensorManager::SensorManager()
    : current_sensor_(), sample_(), temp_handle_(nullptr), temp_started_(false) {}

bool SensorManager::begin(TwoWire& wire) {
  sample_.ads_ok = current_sensor_.begin(wire, Config::kAds1115Address);
  sample_.temp_ok = beginChipTemperature();
  return sample_.ads_ok || sample_.temp_ok;
}

bool SensorManager::update() {
  if (sample_.ads_ok) {
    current_sensor_.update();
    sample_.current_amps = current_sensor_.currentAmps();
    sample_.shunt_millivolts = current_sensor_.shuntMilliVolts();
    sample_.raw_counts = current_sensor_.rawCounts();
    sample_.ads_saturated = current_sensor_.saturated();
  }

  float chip_temp_c = NAN;
  sample_.temp_ok = readChipTemperature(&chip_temp_c);
  sample_.chip_temp_c = chip_temp_c;

  return sample_.ads_ok || sample_.temp_ok;
}

const TelemetrySample& SensorManager::sample() const { return sample_; }

bool SensorManager::beginChipTemperature() {
#if defined(HAS_NEW_TEMP_SENSOR_API)
  temperature_sensor_config_t temp_config =
      TEMPERATURE_SENSOR_CONFIG_DEFAULT(20, 50);
  temperature_sensor_handle_t handle = nullptr;
  if (temperature_sensor_install(&temp_config, &handle) != ESP_OK) {
    return false;
  }
  if (temperature_sensor_enable(handle) != ESP_OK) {
    return false;
  }
  temp_handle_ = handle;
  temp_started_ = true;
  return true;
#elif defined(HAS_OLD_TEMP_SENSOR_API)
  temp_sensor_config_t temp_config = TSENS_CONFIG_DEFAULT();
  if (temp_sensor_set_config(temp_config) != ESP_OK) {
    return false;
  }
  if (temp_sensor_start() != ESP_OK) {
    return false;
  }
  temp_started_ = true;
  return true;
#else
  temp_started_ = false;
  return false;
#endif
}

bool SensorManager::readChipTemperature(float* out_celsius) {
  if (!out_celsius || !temp_started_) {
    return false;
  }

#if defined(HAS_NEW_TEMP_SENSOR_API)
  temperature_sensor_handle_t handle =
      static_cast<temperature_sensor_handle_t>(temp_handle_);
  return temperature_sensor_get_celsius(handle, out_celsius) == ESP_OK;
#elif defined(HAS_OLD_TEMP_SENSOR_API)
  return temp_sensor_read_celsius(out_celsius) == ESP_OK;
#else
  return false;
#endif
}
