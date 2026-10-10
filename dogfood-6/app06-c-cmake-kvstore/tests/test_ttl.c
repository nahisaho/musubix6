#include <stdint.h>
#include "harness.h"
#include "kv/ttl.h"

static uint64_t fake_now;
static uint64_t read_fake(void *ctx) { (void)ctx; return fake_now; }
static kv_clock_t clk = {read_fake, NULL};

/** @id TEST-TTL-001 @verifies REQ-TTL-001 */
static int test_ttl_001_null_clock(void) {
  uint64_t out = 77;
  kv_clock_t bad = {NULL, NULL};
  CHECK(ttl_expires_at(NULL, 10, &out) == KV_EINVAL);
  CHECK(ttl_expires_at(&bad, 10, &out) == KV_EINVAL);
  CHECK(ttl_expires_at(&clk, 10, NULL) == KV_EINVAL);
  CHECK(out == 77);
  return 0;
}

/** @id TEST-TTL-002 @verifies REQ-TTL-002 */
static int test_ttl_002_zero_never(void) {
  uint64_t out = 5;
  fake_now = 1000;
  CHECK(ttl_expires_at(&clk, 0, &out) == KV_OK);
  CHECK(out == 0);
  return 0;
}

/** @id TEST-TTL-003 @verifies REQ-TTL-003 */
static int test_ttl_003_deadline(void) {
  uint64_t out = 0;
  fake_now = 1000;
  CHECK(ttl_expires_at(&clk, 250, &out) == KV_OK);
  CHECK(out == 1250);
  fake_now = 0;
  CHECK(ttl_expires_at(&clk, 5, &out) == KV_OK);
  CHECK(out == 5);
  return 0;
}

/** @id TEST-TTL-004 @verifies REQ-TTL-004 */
static int test_ttl_004_expired_boundary(void) {
  ht_entry_t e = {0};
  e.expires_at = 100;
  CHECK(!ttl_is_expired(&e, 99));
  CHECK(ttl_is_expired(&e, 100));
  CHECK(ttl_is_expired(&e, 101));
  e.expires_at = 0;
  CHECK(!ttl_is_expired(&e, UINT64_MAX));
  return 0;
}

/** @id TEST-TTL-005 @verifies REQ-TTL-005 */
static int test_ttl_005_remaining(void) {
  ht_entry_t e = {0};
  CHECK(ttl_remaining(&e, 50) == -1);
  e.expires_at = 150;
  CHECK(ttl_remaining(&e, 50) == 100);
  CHECK(ttl_remaining(&e, 150) == 0);
  CHECK(ttl_remaining(&e, 999) == 0);
  return 0;
}

static int removed_cb;
static void count_rm(ht_entry_t *e, void *ctx) { (void)e; (void)ctx; removed_cb++; }

/** @id TEST-TTL-006 @verifies REQ-TTL-006 */
static int test_ttl_006_sweep(void) {
  ht_t *t = ht_new();
  for (uint8_t i = 0; i < 6; i++) {
    ht_entry_t *e = ht_put(t, &i, 1, &i, 1);
    e->expires_at = (i < 4) ? (uint64_t)(10 + i) : 0; /* 0..3 expire, 4..5 never */
  }
  fake_now = 12; /* expires 10,11,12 -> removed; 13 stays */
  removed_cb = 0;
  CHECK(ttl_sweep(t, &clk, count_rm, NULL) == 3);
  CHECK(removed_cb == 3);
  CHECK(ht_count(t) == 3);
  uint8_t k3 = 3, k4 = 4;
  CHECK(ht_get(t, &k3, 1) != NULL);
  CHECK(ht_get(t, &k4, 1) != NULL);
  CHECK(ttl_sweep(NULL, &clk, NULL, NULL) == 0);
  ht_free(t);
  return 0;
}

/** @id TEST-TTL-007 @verifies REQ-TTL-007 */
static int test_ttl_007_saturate(void) {
  uint64_t out = 0;
  fake_now = UINT64_MAX - 5;
  CHECK(ttl_expires_at(&clk, 10, &out) == KV_OK);
  CHECK(out == UINT64_MAX);
  return 0;
}

static const harness_case cases[] = {
  {"test_ttl_001_null_clock", test_ttl_001_null_clock}, {"test_ttl_002_zero_never", test_ttl_002_zero_never},
  {"test_ttl_003_deadline", test_ttl_003_deadline}, {"test_ttl_004_expired_boundary", test_ttl_004_expired_boundary},
  {"test_ttl_005_remaining", test_ttl_005_remaining}, {"test_ttl_006_sweep", test_ttl_006_sweep},
  {"test_ttl_007_saturate", test_ttl_007_saturate},
};
int main(int argc, char **argv) { return RUN_ALL(cases); }
