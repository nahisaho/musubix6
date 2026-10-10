#include <stdint.h>
#include <string.h>
#include "harness.h"
#include "frames.h"
#include "kv/store.h"

static uint64_t fake_now;
static uint64_t read_fake(void *ctx) { (void)ctx; return fake_now; }
static kv_clock_t clk = {read_fake, NULL};

#define SET(s, k, v, ttl) store_set((s), (const uint8_t *)(k), strlen(k), (const uint8_t *)(v), strlen(v), (ttl))
static int has(store_t *s, const char *k) {
  const uint8_t *v; size_t n;
  return store_get(s, (const uint8_t *)k, strlen(k), &v, &n) == 0;
}

/** @id TEST-STORE-001 @verifies REQ-STORE-001 */
static int test_store_001_new(void) {
  CHECK(store_new(0, &clk) == NULL);
  CHECK(store_new(4, NULL) == NULL);
  kv_clock_t bad = {NULL, NULL};
  CHECK(store_new(4, &bad) == NULL);
  store_t *s = store_new(4, &clk);
  CHECK(s != NULL && store_count(s) == 0);
  store_free(s);
  return 0;
}

/** @id TEST-STORE-002 @verifies REQ-STORE-002 */
static int test_store_002_set_get(void) {
  store_t *s = store_new(4, &clk);
  const uint8_t *v = NULL; size_t n = 0;
  CHECK(SET(s, "a", "hello", 0) == 0);
  CHECK(store_get(s, (const uint8_t *)"a", 1, &v, &n) == 0);
  CHECK(n == 5 && memcmp(v, "hello", 5) == 0);
  CHECK(store_get(s, (const uint8_t *)"zz", 2, &v, &n) == 1);
  store_free(s);
  return 0;
}

/** @id TEST-STORE-003 @verifies REQ-STORE-003 */
static int test_store_003_expired_miss(void) {
  store_t *s = store_new(4, &clk);
  fake_now = 1000;
  CHECK(SET(s, "a", "v", 100) == 0);
  CHECK(store_count(s) == 1);
  fake_now = 1100; /* exactly at the deadline */
  CHECK(!has(s, "a"));
  CHECK(store_count(s) == 0);
  store_free(s);
  return 0;
}

/** @id TEST-STORE-004 @verifies REQ-STORE-004 */
static int test_store_004_live_before_deadline(void) {
  store_t *s = store_new(4, &clk);
  fake_now = 1000;
  SET(s, "a", "v", 100);
  fake_now = 1099;
  CHECK(has(s, "a"));
  CHECK(store_count(s) == 1);
  store_free(s);
  return 0;
}

/** @id TEST-STORE-005 @verifies REQ-STORE-005 */
static int test_store_005_lru_eviction(void) {
  store_t *s = store_new(2, &clk);
  fake_now = 0;
  SET(s, "a", "1", 0); SET(s, "b", "2", 0);
  CHECK(has(s, "a")); /* b becomes LRU */
  SET(s, "c", "3", 0);
  CHECK(store_count(s) == 2);
  CHECK(has(s, "a") && has(s, "c") && !has(s, "b"));
  store_free(s);
  return 0;
}

/** @id TEST-STORE-006 @verifies REQ-STORE-006 */
static int test_store_006_expired_before_live(void) {
  store_t *s = store_new(3, &clk);
  fake_now = 0;
  SET(s, "old", "1", 0);   /* LRU, live */
  SET(s, "x", "2", 10);    /* expires at 10 */
  SET(s, "y", "3", 10);
  fake_now = 50;
  SET(s, "new", "4", 0);   /* full: sweep x,y instead of evicting old */
  CHECK(store_count(s) == 2);
  CHECK(has(s, "old") && has(s, "new"));
  CHECK(!has(s, "x") && !has(s, "y"));
  SET(s, "n2", "5", 0);    /* room left: nothing evicted */
  CHECK(has(s, "old") && has(s, "new") && has(s, "n2"));
  store_free(s);
  return 0;
}

/** @id TEST-STORE-007 @verifies REQ-STORE-007 */
static int test_store_007_handle(void) {
  store_t *s = store_new(4, &clk);
  uint8_t in[64], out[64]; size_t w = 0, used = 0;
  size_t n = frame(in, 2, "k", "val", 0);
  CHECK(store_handle(s, in, n, out, sizeof out, &w, &used) == PROTO_OK);
  CHECK(used == n && w == 6 && out[0] == 0xB5 && out[1] == STORE_ST_OK);
  n = frame(in, 1, "k", NULL, 0);
  CHECK(store_handle(s, in, n, out, sizeof out, &w, &used) == PROTO_OK);
  CHECK(w == 9 && out[1] == STORE_ST_OK && out[5] == 3 && memcmp(out + 6, "val", 3) == 0);
  n = frame(in, 3, "k", NULL, 0);
  CHECK(store_handle(s, in, n, out, sizeof out, &w, &used) == PROTO_OK && out[1] == STORE_ST_OK);
  n = frame(in, 1, "k", NULL, 0);
  CHECK(store_handle(s, in, n, out, sizeof out, &w, &used) == PROTO_OK && out[1] == STORE_ST_NOTFOUND && w == 6);
  n = frame(in, 3, "k", NULL, 0);
  CHECK(store_handle(s, in, n, out, sizeof out, &w, &used) == PROTO_OK && out[1] == STORE_ST_NOTFOUND);
  store_free(s);
  return 0;
}

/** @id TEST-STORE-008 @verifies REQ-STORE-008 */
static int test_store_008_invalid_frame(void) {
  store_t *s = store_new(4, &clk);
  uint8_t in[64], out[64]; size_t w = 0, used = 7;
  SET(s, "keep", "me", 0);
  size_t n = frame(in, 2, "k", "val", 0);
  in[0] = 0x00; /* bad magic */
  CHECK(store_handle(s, in, n, out, sizeof out, &w, &used) == PROTO_EBADMAGIC);
  CHECK(w == 6 && out[1] == STORE_ST_ERR && used == 0);
  n = frame(in, 9, "k", "val", 0);
  CHECK(store_handle(s, in, n, out, sizeof out, &w, &used) == PROTO_EBADOP && out[1] == STORE_ST_ERR);
  n = frame(in, 2, "k", "val", 0);
  CHECK(store_handle(s, in, n - 1, out, sizeof out, &w, &used) == PROTO_NEED_MORE && w == 0);
  CHECK(store_count(s) == 1 && has(s, "keep") && !has(s, "k"));
  store_free(s);
  return 0;
}

/** @id TEST-STORE-009 @verifies REQ-STORE-009 */
static int test_store_009_feed_pipelined(void) {
  store_t *s = store_new(4, &clk);
  uint8_t in[128], out[128]; size_t w = 0, used = 0;
  size_t n1 = frame(in, 2, "a", "1", 0);
  size_t n2 = frame(in + n1, 1, "a", NULL, 0);
  size_t n3 = frame(in + n1 + n2, 1, "b", NULL, 0);
  size_t partial = 5;
  CHECK(store_feed(s, in, n1 + n2 + n3 + partial, out, sizeof out, &w, &used) == PROTO_OK);
  CHECK(used == n1 + n2 + n3);
  CHECK(w == 6 + 7 + 6);
  CHECK(out[1] == STORE_ST_OK && out[7] == STORE_ST_OK && out[6 + 5] == 1 && out[6 + 7 + 1] == STORE_ST_NOTFOUND);
  store_free(s);
  return 0;
}

/** @id TEST-STORE-010 @verifies REQ-STORE-010 */
static int test_store_010_overwrite_clears_ttl(void) {
  store_t *s = store_new(4, &clk);
  fake_now = 0;
  CHECK(SET(s, "a", "v1", 100) == 0);
  CHECK(SET(s, "a", "v2", 0) == 0);
  fake_now = 500;
  CHECK(has(s, "a"));
  store_free(s);
  return 0;
}

static const harness_case cases[] = {
  {"test_store_001_new", test_store_001_new}, {"test_store_002_set_get", test_store_002_set_get},
  {"test_store_003_expired_miss", test_store_003_expired_miss}, {"test_store_004_live_before_deadline", test_store_004_live_before_deadline},
  {"test_store_005_lru_eviction", test_store_005_lru_eviction}, {"test_store_006_expired_before_live", test_store_006_expired_before_live},
  {"test_store_007_handle", test_store_007_handle}, {"test_store_008_invalid_frame", test_store_008_invalid_frame},
  {"test_store_009_feed_pipelined", test_store_009_feed_pipelined},
  {"test_store_010_overwrite_clears_ttl", test_store_010_overwrite_clears_ttl},
};
int main(int argc, char **argv) { return RUN_ALL(cases); }
