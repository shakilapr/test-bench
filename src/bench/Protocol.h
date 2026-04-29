#pragma once

// Pure-logic helpers shared by firmware and host-side native unit tests.
// No Arduino headers are pulled in here so the file compiles under
// PlatformIO's [env:native] target.

#include <ArduinoJson.h>
#include <stddef.h>
#include <stdint.h>

namespace bench {

struct Reading {
  const char* key;
  float value;
  int quality;  // integer code; 0 == ok
};

// Serializes a v=1 telemetry payload into the provided buffer. Returns the
// number of bytes written (excluding the null terminator), or 0 on overflow.
size_t buildTelemetryJson(char* out, size_t out_len,
                          const char* device_id,
                          const char* boot_id,
                          uint32_t seq,
                          uint32_t ms,
                          const Reading* readings, size_t n_readings);

struct CommandIn {
  char cmd_id[64];
  char type[64];
  // Raw params JSON pointer is held inside the JsonDocument the caller owns.
  // Only set when ok == true.
  bool ok;
  const char* error;
};

// Parses a v=1 command frame. doc must outlive the returned `params`.
// Result.ok is true on success.
CommandIn parseCommand(JsonDocument& doc, const char* json, size_t len);

}  // namespace bench
