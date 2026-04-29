#include <unity.h>
#include "bench/CmdDedupe.h"

using namespace bench;

void setUp() {}
void tearDown() {}

void test_seen_after_record() {
  CmdDedupe<8> d;
  TEST_ASSERT_FALSE(d.seen("a"));
  d.record("a");
  TEST_ASSERT_TRUE(d.seen("a"));
}

void test_record_is_idempotent() {
  CmdDedupe<4> d;
  d.record("a"); d.record("a"); d.record("a");
  TEST_ASSERT_EQUAL_UINT32(1, d.size());
}

void test_ring_eviction() {
  CmdDedupe<3> d;
  d.record("a"); d.record("b"); d.record("c");
  TEST_ASSERT_EQUAL_UINT32(3, d.size());
  // 4th forces eviction of oldest ("a")
  d.record("d");
  TEST_ASSERT_FALSE(d.seen("a"));
  TEST_ASSERT_TRUE(d.seen("b"));
  TEST_ASSERT_TRUE(d.seen("c"));
  TEST_ASSERT_TRUE(d.seen("d"));
}

int main(int, char**) {
  UNITY_BEGIN();
  RUN_TEST(test_seen_after_record);
  RUN_TEST(test_record_is_idempotent);
  RUN_TEST(test_ring_eviction);
  return UNITY_END();
}
