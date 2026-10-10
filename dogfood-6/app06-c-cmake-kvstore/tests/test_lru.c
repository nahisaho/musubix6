#include <stdint.h>
#include <string.h>
#include "harness.h"
#include "kv/lru.h"

#define PUT(c, s) lru_put((c), (const uint8_t *)(s), strlen(s), (const uint8_t *)"v", 1)
#define GET(c, s) lru_get((c), (const uint8_t *)(s), strlen(s))
#define IS_KEY(e, s) ((e) != NULL && (e)->klen == strlen(s) && memcmp((e)->key, (s), strlen(s)) == 0)

/** @id TEST-LRU-001 @verifies REQ-LRU-001 */
static int test_lru_001_new(void) {
  CHECK(lru_new(0) == NULL);
  lru_t *c = lru_new(3);
  CHECK(c != NULL);
  CHECK(lru_count(c) == 0);
  CHECK(lru_mru(c) == NULL && lru_lru(c) == NULL);
  lru_free(c);
  return 0;
}

/** @id TEST-LRU-002 @verifies REQ-LRU-002 */
static int test_lru_002_put_mru(void) {
  lru_t *c = lru_new(3);
  CHECK(PUT(c, "a") != NULL);
  CHECK(PUT(c, "b") != NULL);
  CHECK(lru_count(c) == 2);
  CHECK(IS_KEY(lru_mru(c), "b"));
  CHECK(IS_KEY(lru_lru(c), "a"));
  lru_free(c);
  return 0;
}

static char evicted[8][8];
static int n_evicted;
static void on_evict(const uint8_t *key, size_t klen, void *ctx) {
  (void)ctx;
  if (n_evicted < 8 && klen < 8) { memcpy(evicted[n_evicted], key, klen); evicted[n_evicted][klen] = 0; }
  n_evicted++;
}

/** @id TEST-LRU-003 @verifies REQ-LRU-003 */
static int test_lru_003_evict(void) {
  lru_t *c = lru_new(2);
  PUT(c, "a"); PUT(c, "b"); PUT(c, "c");
  CHECK(lru_count(c) == 2);
  CHECK(GET(c, "a") == NULL);
  CHECK(ht_get(lru_table(c), (const uint8_t *)"a", 1) == NULL);
  CHECK(ht_count(lru_table(c)) == 2);
  CHECK(IS_KEY(lru_lru(c), "b"));
  CHECK(IS_KEY(lru_mru(c), "c"));
  lru_free(c);
  return 0;
}

/** @id TEST-LRU-004 @verifies REQ-LRU-004 */
static int test_lru_004_get_promotes(void) {
  lru_t *c = lru_new(3);
  PUT(c, "a"); PUT(c, "b"); PUT(c, "c");
  CHECK(GET(c, "a") != NULL);
  CHECK(IS_KEY(lru_mru(c), "a"));
  CHECK(IS_KEY(lru_lru(c), "b"));
  CHECK(GET(c, "zzz") == NULL);
  CHECK(IS_KEY(lru_mru(c), "a"));
  CHECK(GET(c, "c") != NULL); /* middle -> head */
  CHECK(IS_KEY(lru_mru(c), "c"));
  CHECK(IS_KEY(lru_lru(c), "b"));
  PUT(c, "d");
  CHECK(GET(c, "b") == NULL);
  lru_free(c);
  return 0;
}

/** @id TEST-LRU-005 @verifies REQ-LRU-005 */
static int test_lru_005_overwrite(void) {
  lru_t *c = lru_new(2);
  n_evicted = 0;
  lru_set_evict_cb(c, on_evict, NULL);
  PUT(c, "a"); PUT(c, "b");
  CHECK(lru_put(c, (const uint8_t *)"a", 1, (const uint8_t *)"new", 3) != NULL);
  CHECK(n_evicted == 0);
  CHECK(lru_count(c) == 2);
  CHECK(IS_KEY(lru_mru(c), "a"));
  CHECK(IS_KEY(lru_lru(c), "b"));
  CHECK(GET(c, "a")->vlen == 3);
  lru_free(c);
  return 0;
}

/** @id TEST-LRU-006 @verifies REQ-LRU-006 */
static int test_lru_006_del(void) {
  lru_t *c = lru_new(4);
  PUT(c, "a"); PUT(c, "b"); PUT(c, "c");
  CHECK(lru_del(c, (const uint8_t *)"b", 1) == 0);
  CHECK(lru_del(c, (const uint8_t *)"b", 1) == -1);
  CHECK(lru_count(c) == 2);
  CHECK(ht_get(lru_table(c), (const uint8_t *)"b", 1) == NULL);
  CHECK(lru_del(c, (const uint8_t *)"c", 1) == 0); /* head */
  CHECK(IS_KEY(lru_mru(c), "a") && IS_KEY(lru_lru(c), "a"));
  CHECK(lru_del(c, (const uint8_t *)"a", 1) == 0);
  CHECK(lru_mru(c) == NULL && lru_lru(c) == NULL);
  lru_free(c);
  return 0;
}

/** @id TEST-LRU-007 @verifies REQ-LRU-007 */
static int test_lru_007_evict_callback(void) {
  lru_t *c = lru_new(2);
  n_evicted = 0;
  lru_set_evict_cb(c, on_evict, NULL);
  PUT(c, "a"); PUT(c, "b"); PUT(c, "c"); PUT(c, "d");
  CHECK(n_evicted == 2);
  CHECK(strcmp(evicted[0], "a") == 0);
  CHECK(strcmp(evicted[1], "b") == 0);
  lru_free(c);
  return 0;
}

static const harness_case cases[] = {
  {"test_lru_001_new", test_lru_001_new}, {"test_lru_002_put_mru", test_lru_002_put_mru},
  {"test_lru_003_evict", test_lru_003_evict}, {"test_lru_004_get_promotes", test_lru_004_get_promotes},
  {"test_lru_005_overwrite", test_lru_005_overwrite}, {"test_lru_006_del", test_lru_006_del},
  {"test_lru_007_evict_callback", test_lru_007_evict_callback},
};
int main(int argc, char **argv) { return RUN_ALL(cases); }
