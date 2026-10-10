#include "harness.h"
#include "arena.h"
#include <stdint.h>

/** @id TEST-ARENA-001 @verifies REQ-ARENA-001 */
TEST(test_arena_001) {
  arena_t *a = arena_new(0);
  CHECK(a != NULL);
  CHECK_EQ_INT(arena_used(a), 0);
  CHECK_EQ_INT(arena_block_count(a), 1);
  CHECK_EQ_INT(arena_block_size(a), 4096);
  arena_t *b = arena_new(100);
  CHECK_EQ_INT(arena_block_size(b), 100);
  arena_free(a); arena_free(b);
}

/** @id TEST-ARENA-002 @verifies REQ-ARENA-002 */
TEST(test_arena_002) {
  static const size_t aligns[] = {1, 2, 4, 8, 16, 32, 64, 128};
  arena_t *a = arena_new(1024);
  for (size_t i = 0; i < sizeof aligns / sizeof aligns[0]; i++) {
    (void)arena_alloc(a, 3, 1); /* perturb offset */
    void *p = arena_alloc(a, 5, aligns[i]);
    CHECK(p != NULL);
    CHECK_EQ_INT((uintptr_t)p % aligns[i], 0);
  }
  arena_free(a);
}

/** @id TEST-ARENA-003 @verifies REQ-ARENA-003 */
TEST(test_arena_003) {
  static const size_t bad[] = {0, 3, 6, 12, 100};
  arena_t *a = arena_new(256);
  (void)arena_alloc(a, 10, 1);
  size_t used = arena_used(a), res = arena_reserved(a);
  for (size_t i = 0; i < sizeof bad / sizeof bad[0]; i++) {
    CHECK(arena_alloc(a, 4, bad[i]) == NULL);
    CHECK_EQ_INT(arena_last_error(a), ARENA_ERR_ALIGN);
    CHECK_EQ_INT(arena_used(a), used);
    CHECK_EQ_INT(arena_reserved(a), res);
  }
  arena_free(a);
}

/** @id TEST-ARENA-004 @verifies REQ-ARENA-004 */
TEST(test_arena_004) {
  arena_t *a = arena_new(64);
  unsigned char *p[20];
  for (int i = 0; i < 20; i++) {
    p[i] = arena_alloc(a, 13, 4);
    CHECK(p[i] != NULL);
    for (int k = 0; k < 13; k++) CHECK(p[i][k] == 0);
    memset(p[i], i + 1, 13);
  }
  for (int i = 0; i < 20; i++)
    for (int k = 0; k < 13; k++) CHECK_EQ_INT(p[i][k], i + 1);
  arena_free(a);
}

/** @id TEST-ARENA-005 @verifies REQ-ARENA-005 */
TEST(test_arena_005) {
  arena_t *a = arena_new(64);
  char *first = arena_alloc(a, 40, 1);
  strcpy(first, "keep me");
  CHECK_EQ_INT(arena_block_count(a), 1);
  void *big = arena_alloc(a, 1000, 16);
  CHECK(big != NULL);
  CHECK_EQ_INT(arena_block_count(a), 2);
  CHECK(arena_reserved(a) >= 64 + 1000 + 16);
  CHECK_EQ_STR(first, "keep me");
  void *small = arena_alloc(a, 8, 8); /* fits in the big block's tail or a new one, never overlaps */
  CHECK(small != NULL && small != big);
  arena_free(a);
}

/** @id TEST-ARENA-006 @verifies REQ-ARENA-006 */
TEST(test_arena_006) {
  arena_t *a = arena_new(64);
  size_t used = arena_used(a), res = arena_reserved(a);
  CHECK(arena_alloc(a, SIZE_MAX, 8) == NULL);
  CHECK_EQ_INT(arena_last_error(a), ARENA_ERR_OVERFLOW);
  CHECK(arena_alloc(a, SIZE_MAX - 4, 8) == NULL);
  CHECK_EQ_INT(arena_last_error(a), ARENA_ERR_OVERFLOW);
  CHECK_EQ_INT(arena_used(a), used);
  CHECK_EQ_INT(arena_reserved(a), res);
  CHECK_EQ_INT(arena_block_count(a), 1);
  arena_free(a);
}

/** @id TEST-ARENA-007 @verifies REQ-ARENA-007 */
TEST(test_arena_007) {
  arena_t *a = arena_new(64);
  (void)arena_alloc(a, 10, 1);
  size_t used0 = arena_used(a), res0 = arena_reserved(a);
  arena_mark_t m = arena_mark(a);
  (void)arena_alloc(a, 30, 1);
  (void)arena_alloc(a, 500, 8); /* new block */
  CHECK(arena_block_count(a) >= 2);
  CHECK_EQ_INT(arena_rewind(a, m), ARENA_OK);
  CHECK_EQ_INT(arena_used(a), used0);
  CHECK_EQ_INT(arena_reserved(a), res0);
  CHECK_EQ_INT(arena_block_count(a), 1);
  CHECK_EQ_INT(arena_rewind(a, m), ARENA_OK); /* the mark itself stays valid */
  arena_free(a);
}

/** @id TEST-ARENA-008 @verifies REQ-ARENA-008 */
TEST(test_arena_008) {
  arena_t *a = arena_new(64);
  arena_mark_t m1 = arena_mark(a);
  (void)arena_alloc(a, 20, 1);
  arena_mark_t m2 = arena_mark(a);
  (void)arena_alloc(a, 20, 1);
  CHECK_EQ_INT(arena_rewind(a, m1), ARENA_OK);
  (void)arena_alloc(a, 20, 1);
  (void)arena_alloc(a, 20, 1); /* state now looks like m2's, yet m2 is stale */
  size_t used = arena_used(a);
  CHECK_EQ_INT(arena_rewind(a, m2), ARENA_ERR_BADMARK);
  CHECK_EQ_INT(arena_used(a), used);
  arena_mark_t m3 = arena_mark(a);
  CHECK_EQ_INT(arena_rewind(a, m2), ARENA_ERR_BADMARK); /* ids are never reused */
  CHECK_EQ_INT(arena_rewind(a, m3), ARENA_OK);
  arena_mark_t bogus = {999, 0};
  CHECK_EQ_INT(arena_rewind(a, bogus), ARENA_ERR_BADMARK);
  arena_free(a);
}

/** @id TEST-ARENA-009 @verifies REQ-ARENA-009 */
TEST(test_arena_009) {
  static const struct { const char *s; size_t n; const char *want; } rows[] = {
    {"hello", 5, "hello"}, {"hello", 3, "hel"}, {"hello", 99, "hello"},
    {"he\0llo", 6, "he"}, {"", 4, ""}, {"abc", 0, ""},
  };
  arena_t *a = arena_new(32);
  for (size_t i = 0; i < sizeof rows / sizeof rows[0]; i++) {
    char *d = arena_strndup(a, rows[i].s, rows[i].n);
    CHECK_EQ_STR(d, rows[i].want);
  }
  arena_free(a);
}

/** @id TEST-ARENA-010 @verifies REQ-ARENA-010 */
TEST(test_arena_010) {
  arena_t *a = arena_new(128);
  char *keep = arena_alloc(a, 16, 1);
  strcpy(keep, "data");
  arena_set_limit(a, 200);
  CHECK(arena_alloc(a, 100, 1) != NULL);       /* fits in first block */
  CHECK(arena_alloc(a, 500, 1) == NULL);       /* would reserve 628 > 200 */
  CHECK_EQ_INT(arena_last_error(a), ARENA_ERR_LIMIT);
  CHECK(arena_reserved(a) <= 200);
  CHECK_EQ_STR(keep, "data");
  CHECK(arena_alloc(a, 8, 1) != NULL);         /* still usable */
  arena_free(a);
}

/** @id TEST-ARENA-011 @verifies REQ-ARENA-011 */
TEST(test_arena_011) {
  arena_t *a = arena_new(64);
  arena_mark_t m = arena_mark(a);
  (void)arena_alloc(a, 60, 1);
  (void)arena_alloc(a, 300, 1);
  (void)arena_alloc(a, 300, 1);
  CHECK(arena_block_count(a) >= 3);
  arena_reset(a);
  CHECK_EQ_INT(arena_used(a), 0);
  CHECK_EQ_INT(arena_block_count(a), 1);
  CHECK_EQ_INT(arena_reserved(a), 64);
  CHECK_EQ_INT(arena_rewind(a, m), ARENA_ERR_BADMARK);
  arena_free(NULL);
  arena_free(a);
}
