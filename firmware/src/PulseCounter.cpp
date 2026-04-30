#include "PulseCounter.h"

#if __has_include(<driver/pulse_cnt.h>)
#include <driver/pulse_cnt.h>
#define HAS_PCNT 1
#else
#define HAS_PCNT 0
#endif

PulseCounter::PulseCounter()
    : unit_(nullptr), channel_(nullptr), ok_(false), last_sample_ms_(0) {}

PulseCounter::~PulseCounter() {
#if HAS_PCNT
  if (unit_) {
    auto u = static_cast<pcnt_unit_handle_t>(unit_);
    pcnt_unit_stop(u);
    pcnt_unit_disable(u);
    pcnt_del_unit(u);
  }
#endif
}

bool PulseCounter::begin(int gpio_pin, uint16_t glitch_ns) {
#if HAS_PCNT
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
#else
  (void)gpio_pin;
  (void)glitch_ns;
  return false;
#endif
}

bool PulseCounter::sampleRpm(uint32_t now_ms, float pulses_per_rev,
                             float* out_rpm) {
  if (!ok_ || !out_rpm) return false;
#if HAS_PCNT
  auto u = static_cast<pcnt_unit_handle_t>(unit_);
  int count = 0;
  if (pcnt_unit_get_count(u, &count) != ESP_OK) return false;
  pcnt_unit_clear_count(u);

  uint32_t dt = (last_sample_ms_ == 0) ? 0 : (now_ms - last_sample_ms_);
  last_sample_ms_ = now_ms;

  if (dt == 0 || pulses_per_rev <= 0.0f) {
    *out_rpm = 0.0f;
    return true;
  }
  // pulses/sec = count * 1000 / dt;  rpm = pps / ppr * 60
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
