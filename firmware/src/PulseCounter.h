#pragma once

#include <stdint.h>

// Wraps the ESP32 PCNT (Pulse Counter) peripheral for a single edge-counted
// signal — typically a Hall sensor reporting motor revolutions.
//
// Why PCNT instead of attachInterrupt: PCNT counts edges in hardware, so
// it survives high pulse rates without losing counts to ISR latency, and
// it has a built-in glitch filter that rejects electrical noise from
// motor commutation. We never see the individual pulses in software —
// we just read the accumulated count once per sample period.
class PulseCounter {
 public:
  PulseCounter();
  ~PulseCounter();

  // Initialises a PCNT unit on `gpio_pin` counting positive (rising)
  // edges only. `glitch_ns` is the minimum pulse width that is *not*
  // filtered out as noise. Returns false if the platform lacks PCNT
  // (e.g. host native build) or hardware init fails.
  bool begin(int gpio_pin, uint16_t glitch_ns);

  // Reads the count accumulated since the last call, clears the
  // counter, and converts to RPM using `pulses_per_rev`. The first
  // call after begin() returns rpm=0 (no time delta yet).
  // Returns true if a value was produced.
  bool sampleRpm(uint32_t now_ms, float pulses_per_rev, float* out_rpm);

  bool ok() const { return ok_; }

 private:
  void* unit_;     // pcnt_unit_handle_t (opaque to keep header light)
  void* channel_;  // pcnt_channel_handle_t
  bool ok_;
  uint32_t last_sample_ms_;
};
