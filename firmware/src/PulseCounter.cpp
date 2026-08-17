#include "PulseCounter.h"

#if __has_include(<driver/pulse_cnt.h>)
#include <driver/pulse_cnt.h>
#define HAS_NEW_PCNT 1
#define HAS_LEGACY_PCNT 0
#elif __has_include(<driver/pcnt.h>)
#include <driver/pcnt.h>
#define HAS_NEW_PCNT 0
#define HAS_LEGACY_PCNT 1
#else
#define HAS_NEW_PCNT 0
#define HAS_LEGACY_PCNT 0
#endif

PulseCounter::PulseCounter()
    : unit_(nullptr), channel_(nullptr), ok_(false), last_sample_ms_(0),
     last_raw_count_(0) {}

PulseCounter::~PulseCounter() {
#if HAS_NEW_PCNT
  if (unit_) {
    auto u = static_cast<pcnt_unit_handle_t>(unit_);
    pcnt_unit_stop(u);
    pcnt_unit_disable(u);
    pcnt_del_unit(u);
  }
#elif HAS_LEGACY_PCNT
  if (ok_) {
    pcnt_unit_t u = (pcnt_unit_t)(uintptr_t)unit_;
    pcnt_filter_disable(u);
  }
#endif
}

bool PulseCounter::begin(int gpio_pin, uint16_t glitch_ns) {
#if HAS_NEW_PCNT
  pcnt_unit_config_t unit_cfg = {};
  unit_cfg.low_limit = -1;
  unit_cfg.high_limit = 32767;

  pcnt_unit_handle_t u = nullptr;
  if (pcnt_new_unit(&unit_cfg, &u) != ESP_OK) return false;

  pcnt_glitch_filter_config_t flt = {};
  flt.max_glitch_ns = glitch_ns;
  if (pcnt_unit_set_glitch_filter(u, &flt) != ESP_OK) {
    pcnt_del_unit(u);
    return false;
  }

  pcnt_chan_config_t ch_cfg = {};
  ch_cfg.edge_gpio_num  = gpio_pin;
  ch_cfg.level_gpio_num = -1;

  pcnt_channel_handle_t c = nullptr;
  if (pcnt_new_channel(u, &ch_cfg, &c) != ESP_OK) {
    pcnt_del_unit(u);
    return false;
  }

  // Count positive edges; ignore negative (otherwise RPM doubles).
  pcnt_channel_set_edge_action(c,
      PCNT_CHANNEL_EDGE_ACTION_INCREASE,
      PCNT_CHANNEL_EDGE_ACTION_HOLD);

  if (pcnt_unit_enable(u) != ESP_OK) { pcnt_del_unit(u); return false; }
  pcnt_unit_clear_count(u);
  pcnt_unit_start(u);

  unit_ = u;
  channel_ = c;
  ok_ = true;
  last_sample_ms_ = 0;
  return true;
#elif HAS_LEGACY_PCNT
  pcnt_unit_t u = PCNT_UNIT_0; // Use PCNT_UNIT_0 as default
  
  pcnt_config_t pcnt_config = {};
  pcnt_config.pulse_gpio_num = gpio_pin;
  pcnt_config.ctrl_gpio_num = -1;
  pcnt_config.lctrl_mode = PCNT_MODE_KEEP;
  pcnt_config.hctrl_mode = PCNT_MODE_KEEP;
  pcnt_config.pos_mode = PCNT_COUNT_INC;  // Count on positive edge
  pcnt_config.neg_mode = PCNT_COUNT_DIS;  // Ignore negative edge
  pcnt_config.counter_h_lim = 32767;
  pcnt_config.counter_l_lim = -1;
  pcnt_config.unit = u;
  pcnt_config.channel = PCNT_CHANNEL_0;

  if (pcnt_unit_config(&pcnt_config) != ESP_OK) return false;

  // Glitch filter
  // glitch_ns is in nanoseconds. ESP32 APB clock is 80 MHz (12.5 ns per cycle).
  // The filter value is set in APB clock cycles, up to 1023 (10 bits).
  // cycles = glitch_ns * 80 / 1000 = glitch_ns * 8 / 100.
  uint16_t filter_val = (uint16_t)((uint32_t)glitch_ns * 80 / 1000);
  if (filter_val > 1023) filter_val = 1023;
  if (filter_val > 0) {
    if (pcnt_set_filter_value(u, filter_val) != ESP_OK) return false;
    if (pcnt_filter_enable(u) != ESP_OK) return false;
  } else {
    if (pcnt_filter_disable(u) != ESP_OK) return false;
  }

  if (pcnt_counter_clear(u) != ESP_OK) return false;
  
  unit_ = (void*)(uintptr_t)u;
  channel_ = nullptr;
  ok_ = true;
  last_sample_ms_ = 0;
  return true;
#else
  (void)gpio_pin;
  (void)glitch_ns;
  return false;
#endif
}

bool PulseCounter::sampleRpm(uint32_t now_ms, float pulses_per_rev,
                             float* out_rpm) {
  if (!ok_ || !out_rpm) return false;
#if HAS_NEW_PCNT
  auto u = static_cast<pcnt_unit_handle_t>(unit_);
  int count = 0;
  if (pcnt_unit_get_count(u, &count) != ESP_OK) return false;
  pcnt_unit_clear_count(u);
  last_raw_count_ = count;  

  uint32_t dt = (last_sample_ms_ == 0) ? 0 : (now_ms - last_sample_ms_);
  last_sample_ms_ = now_ms;

  if (dt == 0 || pulses_per_rev <= 0.0f) {
    *out_rpm = 0.0f;
    return true;
  }
  const float pps = (float)count * 1000.0f / (float)dt;
  *out_rpm = (pps / pulses_per_rev) * 60.0f;
  return true;
#elif HAS_LEGACY_PCNT
  pcnt_unit_t u = (pcnt_unit_t)(uintptr_t)unit_;
  int16_t count = 0;
  if (pcnt_get_counter_value(u, &count) != ESP_OK) return false;
  if (pcnt_counter_clear(u) != ESP_OK) return false;
 last_raw_count_ = count;
 
  uint32_t dt = (last_sample_ms_ == 0) ? 0 : (now_ms - last_sample_ms_);
  last_sample_ms_ = now_ms;

  if (dt == 0 || pulses_per_rev <= 0.0f) {
    *out_rpm = 0.0f;
    return true;
  }
  const float pps = (float)count * 1000.0f / (float)dt;
  *out_rpm = (pps / pulses_per_rev) * 60.0f;
  return true;
#else
  (void)now_ms;
  (void)pulses_per_rev;
  *out_rpm = 0.0f;
  return false;
#endif
}
