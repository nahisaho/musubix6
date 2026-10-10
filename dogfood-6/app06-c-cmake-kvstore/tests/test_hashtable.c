#include <stdint.h>
#include <string.h>
#include "harness.h"
#include "kv/hashtable.h"

/** @id TEST-HT-001 @verifies REQ-HT-001 */
static int test_ht_001_new_empty(void) {
  ht_t *t = ht_new();
  CHECK(t != NULL);
  CHECK(ht_count(t) == 0);
  CHECK(ht_capacity(t) == 8);
  ht_free(t);
  return 0;
}

/** @id TEST-HT-002 @verifies REQ-HT-002 */
static int test_ht_002_put_new(void) {
  ht_t *t = ht_new();
  char k[] = "key", v[] = "val";
  CHECK(ht_put(t, (uint8_t *)k, 3, (uint8_t *)v, 3) != NULL);
  k[0] = 'X'; v[0] = 'Y'; /* table must hold copies */
  CHECK(ht_count(t) == 1);
  ht_entry_t *e = ht_get(t, (const uint8_t *)"key", 3);
  CHECK(e != NULL);
  CHECK(e->vlen == 3 && memcmp(e->val, "val", 3) == 0);
  ht_free(t);
  return 0;
}

/** @id TEST-HT-003 @verifies REQ-HT-003 */
static int test_ht_003_put_replace(void) {
  ht_t *t = ht_new();
  CHECK(ht_put(t, (const uint8_t *)"a", 1, (const uint8_t *)"1", 1) != NULL);
  CHECK(ht_put(t, (const uint8_t *)"a", 1, (const uint8_t *)"22", 2) != NULL);
  CHECK(ht_count(t) == 1);
  ht_entry_t *e = ht_get(t, (const uint8_t *)"a", 1);
  CHECK(e->vlen == 2 && memcmp(e->val, "22", 2) == 0);
  ht_free(t);
  return 0;
}

/** @id TEST-HT-004 @verifies REQ-HT-004 */
static int test_ht_004_get(void) {
  ht_t *t = ht_new();
  ht_put(t, (const uint8_t *)"a", 1, (const uint8_t *)"1", 1);
  CHECK(ht_get(t, (const uint8_t *)"a", 1) != NULL);
  CHECK(ht_get(t, (const uint8_t *)"b", 1) == NULL);
  ht_free(t);
  return 0;
}

/** @id TEST-HT-005 @verifies REQ-HT-005 */
static int test_ht_005_del(void) {
  ht_t *t = ht_new();
  ht_put(t, (const uint8_t *)"a", 1, (const uint8_t *)"1", 1);
  CHECK(ht_del(t, (const uint8_t *)"a", 1) == 0);
  CHECK(ht_count(t) == 0);
  CHECK(ht_get(t, (const uint8_t *)"a", 1) == NULL);
  CHECK(ht_del(t, (const uint8_t *)"a", 1) == -1);
  ht_free(t);
  return 0;
}

/** @id TEST-HT-006 @verifies REQ-HT-006 */
static int test_ht_006_resize(void) {
  ht_t *t = ht_new();
  ht_entry_t *first = NULL;
  for (int i = 0; i < 6; i++) {
    uint8_t k = (uint8_t)('a' + i);
    ht_entry_t *e = ht_put(t, &k, 1, &k, 1);
    if (i == 0) first = e;
  }
  CHECK(ht_capacity(t) == 8); /* 6 == 75% of 8, not above */
  uint8_t k = 'g';
  ht_put(t, &k, 1, &k, 1);
  CHECK(ht_capacity(t) == 16);
  for (int i = 0; i < 7; i++) {
    uint8_t c = (uint8_t)('a' + i);
    CHECK(ht_get(t, &c, 1) != NULL);
  }
  CHECK(ht_get(t, (const uint8_t *)"a", 1) == first);
  for (int i = 0; i < 200; i++) {
    uint8_t kk[2] = {(uint8_t)(i & 0xff), 7};
    ht_put(t, kk, 2, kk, 2);
  }
  CHECK(ht_count(t) == 207);
  CHECK(ht_capacity(t) >= 512);
  ht_free(t);
  return 0;
}

/** @id TEST-HT-007 @verifies REQ-HT-007 */
static int test_ht_007_binary_keys(void) {
  ht_t *t = ht_new();
  const uint8_t k1[] = {'a', 0, 'b'}, k2[] = {'a', 0, 'c'};
  ht_put(t, k1, 3, (const uint8_t *)"1", 1);
  ht_put(t, k2, 3, (const uint8_t *)"2", 1);
  CHECK(ht_count(t) == 2);
  CHECK(ht_get(t, k1, 3)->val[0] == '1');
  CHECK(ht_get(t, k2, 3)->val[0] == '2');
  CHECK(ht_get(t, k1, 2) == NULL);
  ht_free(t);
  return 0;
}

/** @id TEST-HT-008 @verifies REQ-HT-008 */
static int test_ht_008_invalid_args(void) {
  ht_t *t = ht_new();
  CHECK(ht_put(NULL, (const uint8_t *)"a", 1, (const uint8_t *)"1", 1) == NULL);
  CHECK(ht_put(t, NULL, 1, (const uint8_t *)"1", 1) == NULL);
  CHECK(ht_count(t) == 0);
  ht_free(t);
  return 0;
}

static int count_cb;
static void on_rm(ht_entry_t *e, void *ctx) { (void)e; (void)ctx; count_cb++; }
static int is_odd(const ht_entry_t *e, void *ctx) { (void)ctx; return e->key[0] % 2; }

/** @id TEST-HT-009 @verifies REQ-HT-009 */
static int test_ht_009_remove_if(void) {
  ht_t *t = ht_new();
  for (uint8_t i = 0; i < 10; i++) ht_put(t, &i, 1, &i, 1);
  count_cb = 0;
  CHECK(ht_remove_if(t, is_odd, NULL, on_rm, NULL) == 5);
  CHECK(count_cb == 5);
  CHECK(ht_count(t) == 5);
  uint8_t one = 1, two = 2;
  CHECK(ht_get(t, &one, 1) == NULL);
  CHECK(ht_get(t, &two, 1) != NULL);
  ht_free(t);
  return 0;
}

static const harness_case cases[] = {
  {"test_ht_001_new_empty", test_ht_001_new_empty}, {"test_ht_002_put_new", test_ht_002_put_new},
  {"test_ht_003_put_replace", test_ht_003_put_replace}, {"test_ht_004_get", test_ht_004_get},
  {"test_ht_005_del", test_ht_005_del}, {"test_ht_006_resize", test_ht_006_resize},
  {"test_ht_007_binary_keys", test_ht_007_binary_keys}, {"test_ht_008_invalid_args", test_ht_008_invalid_args},
  {"test_ht_009_remove_if", test_ht_009_remove_if},
};
int main(int argc, char **argv) { return RUN_ALL(cases); }
