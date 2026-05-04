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

struct ChannelMeta {
  const char* key;
  const char* label;
  const char* unit;
  const char* kind;
  int precision;
  bool recordable;
  bool chartable;
};

// Serializes a v=1 status payload that conforms to the backend StatusSchema
// (state is the "online"/"offline" enum, boot_id is required). Pass
// fw_version == nullptr to omit the optional field, sample_interval_ms == 0
// to omit it.
size_t buildStatusJson(char* out, size_t out_len,
                       const char* device_id,
                       const char* boot_id,
                       bool online,
                       const char* fw_version,
                       uint32_t sample_interval_ms);

struct QualityCode {
  const char* channel_key;
  int code;
  const char* label;
};

struct CommandParamMeta {
  const char* key;
  const char* type;
  int min;
  int max;
};

struct CommandMeta {
  const char* type;
  const char* label;
  const CommandParamMeta* params;
  size_t n_params;
};

// Serializes a v=1 metadata payload that conforms to the backend
// MetadataSchema. `kind` on each channel is required.
// quality_codes or commands may be nullptr to omit them.
size_t buildMetadataJson(char* out, size_t out_len,
                         const char* device_id,
                         uint32_t metadata_version,
                         const ChannelMeta* channels, size_t n_channels,
                         const QualityCode* qcodes = nullptr, size_t n_qcodes = 0,
                         const CommandMeta* commands = nullptr, size_t n_commands = 0);

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
