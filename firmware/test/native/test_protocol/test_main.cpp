#include <string.h>
#include <unity.h>

#include "bench/CommandRegistry.h"
#include "bench/Protocol.h"

using namespace bench;

void setUp() {}
void tearDown() {}

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

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_buildTelemetryJson_shape);
  RUN_TEST(test_parseCommand_ok);
  RUN_TEST(test_parseCommand_rejects_bad_v);
  RUN_TEST(test_parseCommand_missing_cmd_id);
  RUN_TEST(test_validate_sample_interval_range);
  RUN_TEST(test_unknown_command_type);
  return UNITY_END();
}
