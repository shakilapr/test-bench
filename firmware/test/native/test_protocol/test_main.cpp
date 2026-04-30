#include <limits>
#include <string.h>
#include <unity.h>

#include "bench/CommandRegistry.h"
#include "bench/Protocol.h"

using namespace bench;

void setUp() {}
void tearDown() {}

void test_buildStatusJson_online_shape() {
  char buf[256];
  size_t n = buildStatusJson(buf, sizeof(buf),
                             "bench-01", "boot-xyz",
                             /*online=*/true, "1.2.3",
                             /*sample_interval_ms=*/250);
  TEST_ASSERT_TRUE(n > 0);
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"v\":1"));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"device_id\":\"bench-01\""));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"boot_id\":\"boot-xyz\""));
  // Backend StatusSchema requires the "online"/"offline" enum, not a bool.
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"state\":\"online\""));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"fw\":\"1.2.3\""));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"sample_interval_ms\":250"));
  // Must not regress to the legacy shape.
  TEST_ASSERT_NULL(strstr(buf, "\"online\":true"));
}

void test_buildStatusJson_offline_lwt() {
  // Used as the MQTT Last-Will payload; fw + sample interval should be
  // omitted to keep the LWT compact.
  char buf[256];
  size_t n = buildStatusJson(buf, sizeof(buf),
                             "bench-01", "boot-xyz",
                             /*online=*/false, /*fw=*/nullptr,
                             /*sample_interval_ms=*/0);
  TEST_ASSERT_TRUE(n > 0);
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"state\":\"offline\""));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"boot_id\":\"boot-xyz\""));
  TEST_ASSERT_NULL(strstr(buf, "\"fw\""));
  TEST_ASSERT_NULL(strstr(buf, "\"sample_interval_ms\""));
}

void test_buildMetadataJson_includes_kind() {
  ChannelMeta ch[2] = {
    {"current_a",   "Shunt current",         "A", "measurement", 2, true, true},
    {"chip_temp_c", "Chip Temp",  "C", "health",      1, true, true},
  };
  char buf[512];
  size_t n = buildMetadataJson(buf, sizeof(buf), "bench-01",
                               /*metadata_version=*/3, ch, 2);
  TEST_ASSERT_TRUE(n > 0);
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"v\":1"));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"device_id\":\"bench-01\""));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"metadata_version\":3"));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"key\":\"current_a\""));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"label\":\"Shunt current\""));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"unit\":\"A\""));
  // Backend MetadataSchema requires `kind` on every channel.
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"kind\":\"measurement\""));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"kind\":\"health\""));
}

void test_buildTelemetryJson_shape() {
  Reading r[2] = {
    {"current_a", 1.25f, 0},
    {"chip_temp_c", 30.5f, 1},
  };
  char buf[512];
  size_t n = buildTelemetryJson(buf, sizeof(buf),
                                "bench-01", "boot-xyz", 7, 12345, r, 2);
  TEST_ASSERT_TRUE(n > 0);
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"v\":1"));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"device_id\":\"bench-01\""));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"boot_id\":\"boot-xyz\""));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"seq\":7"));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"current_a\":1.25"));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"chip_temp_c\":30.5"));
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"quality\""));
}

void test_parseCommand_ok() {
  const char* json = "{\"v\":1,\"cmd_id\":\"abc\",\"type\":\"set_sample_interval\",\"params\":{\"interval_ms\":250}}";
  JsonDocument doc;
  CommandIn c = parseCommand(doc, json, strlen(json));
  TEST_ASSERT_TRUE(c.ok);
  TEST_ASSERT_EQUAL_STRING("abc", c.cmd_id);
  TEST_ASSERT_EQUAL_STRING("set_sample_interval", c.type);
  ValidationResult v = validateCommandParams(c.type, doc["params"]);
  TEST_ASSERT_TRUE(v.ok);
}

void test_parseCommand_rejects_bad_v() {
  const char* json = "{\"v\":2,\"cmd_id\":\"a\",\"type\":\"set_sample_interval\"}";
  JsonDocument doc;
  CommandIn c = parseCommand(doc, json, strlen(json));
  TEST_ASSERT_FALSE(c.ok);
}

void test_parseCommand_missing_cmd_id() {
  const char* json = "{\"v\":1,\"type\":\"set_sample_interval\"}";
  JsonDocument doc;
  CommandIn c = parseCommand(doc, json, strlen(json));
  TEST_ASSERT_FALSE(c.ok);
}

void test_validate_sample_interval_range() {
  JsonDocument doc;
  deserializeJson(doc, "{\"interval_ms\":50}");
  ValidationResult low = validateCommandParams("set_sample_interval", doc.as<JsonVariantConst>());
  TEST_ASSERT_FALSE(low.ok);

  deserializeJson(doc, "{\"interval_ms\":20000}");
  ValidationResult high = validateCommandParams("set_sample_interval", doc.as<JsonVariantConst>());
  TEST_ASSERT_FALSE(high.ok);

  deserializeJson(doc, "{\"interval_ms\":500}");
  ValidationResult ok = validateCommandParams("set_sample_interval", doc.as<JsonVariantConst>());
  TEST_ASSERT_TRUE(ok.ok);
}

void test_unknown_command_type() {
  JsonDocument doc;
  deserializeJson(doc, "{}");
  ValidationResult v = validateCommandParams("does_not_exist", doc.as<JsonVariantConst>());
  TEST_ASSERT_FALSE(v.ok);
}

void test_buildTelemetryJson_skips_nan_readings() {
  // When a sensor fails (e.g. chip temp not started) its value is NaN.
  // NaN serialises as JSON null which the backend z.number() schema rejects,
  // silently dropping the entire packet. The builder must skip NaN values.
  float nan_val = std::numeric_limits<float>::quiet_NaN();
  Reading r[2] = {
    {"current_a",   1.5f,    0},
    {"chip_temp_c", nan_val, 1},  // <-- sensor failed; must be skipped
  };
  char buf[512];
  size_t n = buildTelemetryJson(buf, sizeof(buf), "bench-01", "b", 0, 0, r, 2);
  TEST_ASSERT_TRUE(n > 0);
  // Good reading present.
  TEST_ASSERT_NOT_NULL(strstr(buf, "\"current_a\":1.5"));
  // NaN reading absent — no null, no chip_temp_c key.
  TEST_ASSERT_NULL(strstr(buf, "chip_temp_c"));
  TEST_ASSERT_NULL(strstr(buf, "null"));
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_buildTelemetryJson_shape);
  RUN_TEST(test_buildTelemetryJson_skips_nan_readings);
  RUN_TEST(test_buildStatusJson_online_shape);
  RUN_TEST(test_buildStatusJson_offline_lwt);
  RUN_TEST(test_buildMetadataJson_includes_kind);
  RUN_TEST(test_parseCommand_ok);
  RUN_TEST(test_parseCommand_rejects_bad_v);
  RUN_TEST(test_parseCommand_missing_cmd_id);
  RUN_TEST(test_validate_sample_interval_range);
  RUN_TEST(test_unknown_command_type);
  return UNITY_END();
}
