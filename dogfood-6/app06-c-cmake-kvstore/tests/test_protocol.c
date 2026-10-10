#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "harness.h"
#include "kv/protocol.h"

static size_t build(uint8_t *b, uint8_t magic, uint8_t op, uint32_t klen, uint32_t vlen, uint32_t ttl,
                    const char *key, const char *val) {
  b[0] = magic; b[1] = op;
  b[2] = (uint8_t)(klen >> 8); b[3] = (uint8_t)klen;
  b[4] = (uint8_t)(vlen >> 24); b[5] = (uint8_t)(vlen >> 16); b[6] = (uint8_t)(vlen >> 8); b[7] = (uint8_t)vlen;
  b[8] = (uint8_t)(ttl >> 24); b[9] = (uint8_t)(ttl >> 16); b[10] = (uint8_t)(ttl >> 8); b[11] = (uint8_t)ttl;
  size_t n = 12;
  if (key) { memcpy(b + n, key, strlen(key)); n += strlen(key); }
  if (val) { memcpy(b + n, val, strlen(val)); n += strlen(val); }
  return n;
}

/** @id TEST-PROTO-001 @verifies REQ-PROTO-001 */
static int test_proto_001_parse_set(void) {
  uint8_t b[64]; proto_req_t r; size_t used = 0;
  size_t n = build(b, 0xB5, 2, 3, 5, 0x01020304, "foo", "hello");
  CHECK(proto_parse(b, n, &r, &used) == PROTO_OK);
  CHECK(r.op == PROTO_OP_SET && r.klen == 3 && r.vlen == 5 && r.ttl_ms == 0x01020304u);
  CHECK(memcmp(r.key, "foo", 3) == 0 && memcmp(r.val, "hello", 5) == 0);
  CHECK(used == n);
  n = build(b, 0xB5, 1, 3, 0, 0, "foo", NULL);
  CHECK(proto_parse(b, n, &r, &used) == PROTO_OK && r.op == PROTO_OP_GET && used == 15);
  return 0;
}

/** @id TEST-PROTO-002 @verifies REQ-PROTO-002 */
static int test_proto_002_short_header(void) {
  uint8_t b[64]; proto_req_t r; size_t used = 99;
  size_t n = build(b, 0xB5, 2, 3, 5, 0, "foo", "hello");
  (void)n;
  for (size_t len = 0; len < 12; len++) {
    used = 99;
    CHECK(proto_parse(b, len, &r, &used) == PROTO_NEED_MORE);
    CHECK(used == 0);
  }
  return 0;
}

/** @id TEST-PROTO-003 @verifies REQ-PROTO-003 */
static int test_proto_003_short_body(void) {
  uint8_t b[64]; proto_req_t r; size_t used = 99;
  size_t n = build(b, 0xB5, 2, 3, 5, 0, "foo", "hello");
  for (size_t len = 12; len < n; len++) {
    used = 99;
    CHECK(proto_parse(b, len, &r, &used) == PROTO_NEED_MORE);
    CHECK(used == 0);
  }
  CHECK(proto_parse(b, n, &r, &used) == PROTO_OK);
  return 0;
}

/** @id TEST-PROTO-004 @verifies REQ-PROTO-004 */
static int test_proto_004_bad_magic(void) {
  uint8_t b[64]; proto_req_t r; size_t used = 0;
  size_t n = build(b, 0xB4, 2, 3, 5, 0, "foo", "hello");
  CHECK(proto_parse(b, n, &r, &used) == PROTO_EBADMAGIC);
  CHECK(proto_parse(b, 12, &r, &used) == PROTO_EBADMAGIC);
  return 0;
}

/** @id TEST-PROTO-005 @verifies REQ-PROTO-005 */
static int test_proto_005_bad_op(void) {
  uint8_t b[64]; proto_req_t r; size_t used = 0;
  size_t n = build(b, 0xB5, 0, 3, 0, 0, "foo", NULL);
  CHECK(proto_parse(b, n, &r, &used) == PROTO_EBADOP);
  n = build(b, 0xB5, 4, 3, 0, 0, "foo", NULL);
  CHECK(proto_parse(b, n, &r, &used) == PROTO_EBADOP);
  return 0;
}

/** @id TEST-PROTO-006 @verifies REQ-PROTO-006 */
static int test_proto_006_limits(void) {
  uint8_t b[64]; proto_req_t r; size_t used = 0;
  build(b, 0xB5, 1, 0, 0, 0, NULL, NULL);
  CHECK(proto_parse(b, 12, &r, &used) == PROTO_ELIMIT);
  build(b, 0xB5, 1, 251, 0, 0, NULL, NULL);
  CHECK(proto_parse(b, 12, &r, &used) == PROTO_ELIMIT);
  build(b, 0xB5, 2, 3, 1048577u, 0, NULL, NULL);
  CHECK(proto_parse(b, 12, &r, &used) == PROTO_ELIMIT);
  build(b, 0xB5, 2, 3, 0xFFFFFFFFu, 0, NULL, NULL);
  CHECK(proto_parse(b, 12, &r, &used) == PROTO_ELIMIT);
  build(b, 0xB5, 2, 250, 1048576u, 0, NULL, NULL);
  CHECK(proto_parse(b, 12, &r, &used) == PROTO_NEED_MORE);
  return 0;
}

/** @id TEST-PROTO-007 @verifies REQ-PROTO-007 */
static int test_proto_007_get_del_no_value(void) {
  uint8_t b[64]; proto_req_t r; size_t used = 0;
  size_t n = build(b, 0xB5, 1, 3, 2, 0, "foo", "xx");
  CHECK(proto_parse(b, n, &r, &used) == PROTO_EBADLEN);
  n = build(b, 0xB5, 3, 3, 1, 0, "foo", "x");
  CHECK(proto_parse(b, n, &r, &used) == PROTO_EBADLEN);
  n = build(b, 0xB5, 3, 3, 0, 0, "foo", NULL);
  CHECK(proto_parse(b, n, &r, &used) == PROTO_OK);
  return 0;
}

/** @id TEST-PROTO-008 @verifies REQ-PROTO-008 */
static int test_proto_008_null_args(void) {
  uint8_t b[64]; proto_req_t r; size_t used = 0;
  size_t n = build(b, 0xB5, 1, 3, 0, 0, "foo", NULL);
  CHECK(proto_parse(NULL, n, &r, &used) == PROTO_EINVAL);
  CHECK(proto_parse(b, n, NULL, &used) == PROTO_EINVAL);
  CHECK(proto_parse(b, n, &r, NULL) == PROTO_EINVAL);
  return 0;
}

/** @id TEST-PROTO-009 @verifies REQ-PROTO-009 */
static int test_proto_009_zero_copy_bounds(void) {
  uint8_t tmp[64]; proto_req_t r; size_t used = 0;
  size_t n = build(tmp, 0xB5, 2, 3, 5, 0, "foo", "hello");
  uint8_t *heap = malloc(n);
  CHECK(heap != NULL);
  memcpy(heap, tmp, n);
  CHECK(proto_parse(heap, n, &r, &used) == PROTO_OK);
  CHECK(r.key == heap + 12);
  CHECK(r.val == heap + 15);
  CHECK(r.val + r.vlen == heap + n);
  free(heap);
  return 0;
}

/** @id TEST-PROTO-010 @verifies REQ-PROTO-010 */
static int test_proto_010_encode_response(void) {
  uint8_t out[16]; size_t w = 0;
  memset(out, 0xEE, sizeof out);
  CHECK(proto_encode_response(0, (const uint8_t *)"abc", 3, out, sizeof out, &w) == PROTO_OK);
  CHECK(w == 9);
  const uint8_t want[] = {0xB5, 0, 0, 0, 0, 3, 'a', 'b', 'c'};
  CHECK(memcmp(out, want, 9) == 0);
  memset(out, 0xEE, sizeof out);
  w = 5;
  CHECK(proto_encode_response(0, (const uint8_t *)"abc", 3, out, 8, &w) == PROTO_ENOSPACE);
  CHECK(out[0] == 0xEE && out[7] == 0xEE);
  CHECK(proto_encode_response(1, NULL, 0, out, 6, &w) == PROTO_OK && w == 6);
  CHECK(proto_encode_response(0, NULL, 3, out, 16, &w) == PROTO_EINVAL);
  return 0;
}

/** @id TEST-PROTO-011 @verifies REQ-PROTO-011 */
static int test_proto_011_pipelined(void) {
  uint8_t b[128]; proto_req_t r; size_t used = 0;
  size_t n1 = build(b, 0xB5, 1, 3, 0, 0, "foo", NULL);
  size_t n2 = build(b + n1, 0xB5, 2, 1, 1, 9, "k", "v");
  CHECK(proto_parse(b, n1 + n2, &r, &used) == PROTO_OK);
  CHECK(used == n1 && r.op == PROTO_OP_GET);
  CHECK(proto_parse(b + used, n1 + n2 - used, &r, &used) == PROTO_OK);
  CHECK(used == n2 && r.op == PROTO_OP_SET && r.ttl_ms == 9);
  return 0;
}

static const harness_case cases[] = {
  {"test_proto_001_parse_set", test_proto_001_parse_set}, {"test_proto_002_short_header", test_proto_002_short_header},
  {"test_proto_003_short_body", test_proto_003_short_body}, {"test_proto_004_bad_magic", test_proto_004_bad_magic},
  {"test_proto_005_bad_op", test_proto_005_bad_op}, {"test_proto_006_limits", test_proto_006_limits},
  {"test_proto_007_get_del_no_value", test_proto_007_get_del_no_value}, {"test_proto_008_null_args", test_proto_008_null_args},
  {"test_proto_009_zero_copy_bounds", test_proto_009_zero_copy_bounds}, {"test_proto_010_encode_response", test_proto_010_encode_response},
  {"test_proto_011_pipelined", test_proto_011_pipelined},
};
int main(int argc, char **argv) { return RUN_ALL(cases); }
