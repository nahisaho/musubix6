#include "jsonhelp.h"

#define ROWS(rows, opts) check_rows(__FILE__, __LINE__, rows, sizeof(rows) / sizeof((rows)[0]), opts)

/** @id TEST-PARSE-001 @verifies REQ-PARSE-001 */
TEST(test_parse_001) {
  static const prow rows[] = {
    {"null", "null"}, {"true", "true"}, {"false", "false"}, {"0", "i0"}, {"-12", "i-12"},
    {"1.5", "d1.5"}, {"1e2", "d100"}, {"0.5", "d0.5"}, {"\"hi\"", "\"hi\""}, {"[]", "[]"}, {"{}", "{}"},
    {"[1,[2,[3]]]", "[i1,[i2,[i3]]]"}, {"{\"a\":{\"b\":[true,null]}}", "{\"a\":{\"b\":[true,null]}}"},
    {" [ {\"x\":1} , {\"y\":\"z\"} ] ", "[{\"x\":i1},{\"y\":\"z\"}]"}, {"\"\\u00e9\\n\"", "\"\xc3\xa9\n\""},
    {"{\"k\":\"\\ud83d\\ude00\"}", "{\"k\":\"\xf0\x9f\x98\x80\"}"}, {"[[],[[]],{}]", "[[],[[]],{}]"},
  };
  ROWS(rows, NULL);
}

/** @id TEST-PARSE-002 @verifies REQ-PARSE-002 */
TEST(test_parse_002) {
  static const prow strict[] = {
    {"{\"a\":1,\"a\":2}", "ERR_DUPKEY@1:8+7 path=/a msg=duplicate key"},
    {"{\"o\":{\"k\":1,\"k\":2}}", "ERR_DUPKEY@1:13+12 path=/o/k msg=duplicate key"},
    {"{\"a\":1,\"\\u0061\":2}", "ERR_DUPKEY@1:8+7 path=/a msg=duplicate key"},
    {"{\"a\":1,\"b\":2,\"c\":3}", "{\"a\":i1,\"b\":i2,\"c\":i3}"},
    {"{\"b\":1,\"a\":2}", "{\"b\":i1,\"a\":i2}"},
    {"[{\"a\":1},{\"a\":1}]", "[{\"a\":i1},{\"a\":i1}]"},
    {"{\"a\":1,\"ab\":2,\"a\\u0001\":3}", "{\"a\":i1,\"ab\":i2,\"a\x01\":i3}"},
  };
  ROWS(strict, NULL);
  arena_t *na = arena_new(512);
  json_value *nul; json_error nerr;
  CHECK_EQ_INT(json_parse(na, "{\"a\":1,\"a\\u0000\":2}", 19, NULL, &nul, &nerr), JSON_OK);
  CHECK(nul != NULL && nul->u.obj.count == 2 && nul->u.obj.members[1].key_len == 2);
  arena_free(na);
  static const prow last[] = {
    {"{\"a\":1,\"b\":2,\"a\":3}", "{\"a\":i3,\"b\":i2}"},
    {"{\"a\":1,\"a\":2,\"a\":3}", "{\"a\":i3}"},
    {"{\"o\":{\"k\":1,\"k\":[2]}}", "{\"o\":{\"k\":[i2]}}"},
  };
  json_opts o = {0, JSON_DUP_LAST, 0};
  ROWS(last, &o);
}

/** @id TEST-PARSE-003 @verifies REQ-PARSE-003 */
TEST(test_parse_003) {
  char in[512], out[1024];
  size_t n = 0;
  for (int i = 0; i < 64; i++) in[n++] = '[';
  for (int i = 0; i < 64; i++) in[n++] = ']';
  in[n] = 0;
  parse_dump_opts(in, n, 0, NULL, out, sizeof out);
  CHECK(out[0] == '[' && strncmp(out, "ERR", 3) != 0);
  memmove(in + 1, in, n + 1); in[0] = '[';
  in[n + 1] = ']'; in[n + 2] = 0;
  parse_dump_opts(in, n + 2, 0, NULL, out, sizeof out);
  char want[512] = "ERR_DEPTH@1:65+64 path=";
  for (int i = 0; i < 64; i++) strcat(want, "/0");
  strcat(want, " msg=nesting too deep");
  CHECK_EQ_STR(out, want);
  static const prow rows[] = {
    {"[[[[1]]]]", "ERR_DEPTH@1:4+3 path=/0/0/0 msg=nesting too deep"},
    {"{\"a\":{\"b\":{\"c\":{}}}}", "ERR_DEPTH@1:16+15 path=/a/b/c msg=nesting too deep"},
    {"[[[1]]]", "[[[i1]]]"},
    {"[[[]],[[]]]", "[[[]],[[]]]"},
    {"[[[1]]", "ERR_SYNTAX@1:7+6 path=/1 msg=unexpected end of input"},
  };
  json_opts o = {3, JSON_DUP_ERROR, 0};
  ROWS(rows, &o);
}

/** @id TEST-PARSE-004 @verifies REQ-PARSE-004 */
TEST(test_parse_004) {
  static const prow rows[] = {
    {"[1,]", "ERR_SYNTAX@1:4+3 path=/1 msg=expected value"},
    {"[,1]", "ERR_SYNTAX@1:2+1 path=/0 msg=expected value or ']'"},
    {"{\"a\" 1}", "ERR_SYNTAX@1:6+5 path=/a msg=expected ':'"},
    {"{1:2}", "ERR_SYNTAX@1:2+1 path= msg=expected string key or '}'"},
    {"[1 2]", "ERR_SYNTAX@1:4+3 path=/1 msg=expected ',' or ']'"},
    {"{\"a\":1 \"b\":2}", "ERR_SYNTAX@1:8+7 path= msg=expected ',' or '}'"},
    {"{\"a\":1,}", "ERR_SYNTAX@1:8+7 path= msg=expected string key"},
    {"{\"a\":}", "ERR_SYNTAX@1:6+5 path=/a msg=expected value"},
    {"[1}", "ERR_SYNTAX@1:3+2 path=/1 msg=expected ',' or ']'"},
    {"{\"a\":1]", "ERR_SYNTAX@1:7+6 path= msg=expected ',' or '}'"},
    {"[1,2", "ERR_SYNTAX@1:5+4 path=/2 msg=unexpected end of input"},
    {"{\"a\":[1", "ERR_SYNTAX@1:8+7 path=/a/1 msg=unexpected end of input"},
    {"]", "ERR_SYNTAX@1:1+0 path= msg=expected value"},
    {":", "ERR_SYNTAX@1:1+0 path= msg=expected value"},
    {"[[1,2],[3,]]", "ERR_SYNTAX@1:11+10 path=/1/1 msg=expected value"},
    {"{\"a\":{\"b\" 2}}", "ERR_SYNTAX@1:11+10 path=/a/b msg=expected ':'"},
    {"[1, tru]", "ERR_LEX(ERR_LITERAL)@1:8+7 path=/1 msg=bad literal"},
    {"{\"a\":\"\x01\"}", "ERR_LEX(ERR_CTRL)@1:7+6 path=/a msg=control character in string"},
  };
  ROWS(rows, NULL);
}

/** @id TEST-PARSE-005 @verifies REQ-PARSE-005 */
TEST(test_parse_005) {
  static const prow rows[] = {
    {"", "ERR_EMPTY@1:1+0 path= msg=empty document"},
    {"  \n ", "ERR_EMPTY@2:2+4 path= msg=empty document"},
    {"1 2", "ERR_TRAILING@1:3+2 path= msg=unexpected content after document"},
    {"{} []", "ERR_TRAILING@1:4+3 path= msg=unexpected content after document"},
    {"[1]]", "ERR_TRAILING@1:4+3 path= msg=unexpected content after document"},
    {"true false", "ERR_TRAILING@1:6+5 path= msg=unexpected content after document"},
    {"null,", "ERR_TRAILING@1:5+4 path= msg=unexpected content after document"},
    {"\"a\"\n\"b\"", "ERR_TRAILING@2:1+4 path= msg=unexpected content after document"},
    {"  [1]  \n", "[i1]"},
  };
  ROWS(rows, NULL);
}

/** @id TEST-PARSE-006 @verifies REQ-PARSE-006 */
TEST(test_parse_006) {
  static const prow rows[] = {
    {"0", "i0"}, {"-0", "d-0"}, {"-0.0", "d-0"}, {"0.0", "d0"},
    {"9223372036854775807", "i9223372036854775807"}, {"-9223372036854775808", "i-9223372036854775808"},
    {"9223372036854775808", "d9.2233720368547758e+18"}, {"-9223372036854775809", "d-9.2233720368547758e+18"},
    {"1e2", "d100"}, {"12.5", "d12.5"}, {"1.25e1", "d12.5"}, {"5E-1", "d0.5"}, {"1e-400", "d0"},
    {"123456789012345678901234567890", "d1.2345678901234568e+29"},
    {"1e400", "ERR_RANGE@1:1+0 path= msg=number out of range"},
    {"-1e400", "ERR_RANGE@1:1+0 path= msg=number out of range"},
    {"[1,1e999]", "ERR_RANGE@1:4+3 path=/1 msg=number out of range"},
    {"{\"x\":[0,2e308]}", "ERR_RANGE@1:9+8 path=/x/1 msg=number out of range"},
    {"[1.7976931348623157e308]", "[d1.7976931348623157e+308]"},
  };
  ROWS(rows, NULL);
}

/** @id TEST-PARSE-007 @verifies REQ-PARSE-007 */
TEST(test_parse_007) {
  static const char *docs[] = {
    "{\"a\": [1, 2.5e-3, true, null, \"x\\ud83d\\ude00y\"], \"b\": {\"c\": []}, \"d\": -9223372036854775808}",
    "[[1,2],[3,4],{\"k\":\"v\"}]",
    "{\"a\":1,\"a\":2}",
    "[1,,2]",
    "[1, 2",
    "123 456",
    "  ",
    "{\"a\":\"\xe2\x82\xac\"}",
    "[\"\xe2\x82",
  };
  char whole[2048], part[2048];
  for (size_t d = 0; d < sizeof docs / sizeof docs[0]; d++) {
    size_t len = strlen(docs[d]);
    parse_dump_opts(docs[d], len, 0, NULL, whole, sizeof whole);
    for (size_t chunk = 1; chunk <= 9; chunk++) {
      parse_dump_opts(docs[d], len, chunk, NULL, part, sizeof part);
      if (strcmp(whole, part) != 0) { printf("CHECK failed: doc %zu chunk %zu [%s] vs [%s] (%s:%d)\n", d, chunk, part, whole, __FILE__, __LINE__); g_failed = 1; }
    }
  }
  parse_dump_opts(docs[0], strlen(docs[0]), 1, NULL, part, sizeof part);
  CHECK_EQ_STR(part, "{\"a\":[i1,d0.0025000000000000001,true,null,\"x\xf0\x9f\x98\x80y\"],\"b\":{\"c\":[]},\"d\":i-9223372036854775808}");
  parse_dump_opts(docs[3], strlen(docs[3]), 2, NULL, part, sizeof part);
  CHECK_EQ_STR(part, "ERR_SYNTAX@1:4+3 path=/1 msg=expected value");
}

/** @id TEST-PARSE-008 @verifies REQ-PARSE-008 */
TEST(test_parse_008) {
  static const prow rows[] = {
    {"{\"a/b\":{\"c~d\":[0,]}}", "ERR_SYNTAX@1:18+17 path=/a~1b/c~0d/1 msg=expected value"},
    {"{\"\":[1,]}", "ERR_SYNTAX@1:8+7 path=//1 msg=expected value"},
    {"{\n \"a\": [\n  1,\n  ]\n}", "ERR_SYNTAX@4:3+17 path=/a/1 msg=expected value"},
    {"{\"~1\":[]]", "ERR_SYNTAX@1:9+8 path= msg=expected ',' or '}'"},
    {"[[],[0,0,0,]]", "ERR_SYNTAX@1:12+11 path=/1/3 msg=expected value"},
  };
  ROWS(rows, NULL);
  char in[600], out[1024];
  size_t n = (size_t)snprintf(in, sizeof in, "{\"");
  for (int i = 0; i < 300; i++) in[n++] = 'k';
  n += (size_t)snprintf(in + n, sizeof in - n, "\":[1,]}");
  parse_dump_opts(in, n, 0, NULL, out, sizeof out);
  const char *p = strstr(out, "path=");
  CHECK(p != NULL);
  if (p) {
    const char *end = strstr(p, " msg=");
    CHECK(end != NULL);
    if (end) CHECK_EQ_INT((size_t)(end - (p + 5)), 255);
    CHECK(strncmp(p + 5, "/kkkk", 5) == 0);
  }
}

/** @id TEST-PARSE-009 @verifies REQ-PARSE-009 */
TEST(test_parse_009) {
  arena_t *a = arena_new(256);
  (void)arena_alloc(a, 24, 8);
  arena_mark_t m = arena_mark(a);
  size_t used0 = arena_used(a), res0 = arena_reserved(a), blocks0 = arena_block_count(a);
  static const char *bad[] = {
    "{\"a\":[1,2,3,\"str\"],\"b\":}", "[[1,2,3],{\"a\":\"x\"},[", "[1,2] 3", "{\"a\":1,\"a\":2}", "[1e999]", "\"abc",
  };
  for (size_t i = 0; i < sizeof bad / sizeof bad[0]; i++) {
    json_value *root = (json_value *)0x1;
    json_error err;
    json_err e = json_parse(a, bad[i], strlen(bad[i]), NULL, &root, &err);
    CHECK(e != JSON_OK);
    CHECK(root == NULL);
    CHECK_EQ_INT(arena_used(a), used0);
    CHECK_EQ_INT(arena_reserved(a), res0);
    CHECK_EQ_INT(arena_block_count(a), blocks0);
  }
  char *big = malloc(40000);
  size_t n = 0;
  big[n++] = '[';
  for (int i = 0; i < 3000; i++) n += (size_t)sprintf(big + n, "\"item%d\",", i);
  n += (size_t)sprintf(big + n, "]");
  json_value *root = NULL; json_error err;
  CHECK_EQ_INT(json_parse(a, big, n, NULL, &root, &err), JSON_ERR_SYNTAX);
  CHECK_EQ_INT(arena_used(a), used0);
  CHECK_EQ_INT(arena_reserved(a), res0);
  CHECK_EQ_INT(arena_rewind(a, m), ARENA_OK);
  CHECK_EQ_INT(json_parse(a, "[1,2,3]", 7, NULL, &root, &err), JSON_OK);
  CHECK(root != NULL && arena_used(a) > used0);
  free(big);
  arena_free(a);
}

/** @id TEST-PARSE-010 @verifies REQ-PARSE-010 */
TEST(test_parse_010) {
  arena_t *a = arena_new(4096);
  char *in = malloc(30000);
  size_t n = 0;
  n += (size_t)sprintf(in + n, "{\"k\":-1,\"k1\":-2,\"k10\":-3,\"\":-4");
  for (int i = 0; i < 1000; i++) n += (size_t)sprintf(in + n, ",\"k%d\":%d", i + 2000, i);
  n += (size_t)sprintf(in + n, "}");
  json_value *root; json_error err;
  CHECK_EQ_INT(json_parse(a, in, n, NULL, &root, &err), JSON_OK);
  CHECK(root->u.obj.index != NULL);
  CHECK_EQ_INT(root->u.obj.count, 1004);
  for (int i = 0; i < 1000; i++) {
    char key[16]; sprintf(key, "k%d", i + 2000);
    const json_value *v = json_obj_get(root, key);
    if (!v || v->type != JSON_INT || v->u.i != i) { printf("CHECK failed: key %s (%s:%d)\n", key, __FILE__, __LINE__); g_failed = 1; break; }
  }
  CHECK_EQ_INT(json_obj_get(root, "k")->u.i, -1);
  CHECK_EQ_INT(json_obj_get(root, "k1")->u.i, -2);
  CHECK_EQ_INT(json_obj_get(root, "k10")->u.i, -3);
  CHECK_EQ_INT(json_obj_get(root, "")->u.i, -4);
  CHECK(json_obj_get(root, "k100") == NULL);
  CHECK(json_obj_get(root, "K") == NULL);
  CHECK(json_obj_get(root, "k3000") == NULL);
  CHECK(json_obj_get(root, "k2000x") == NULL);
  json_value *small;
  CHECK_EQ_INT(json_parse(a, "{\"ab\":1,\"abc\":2,\"a\":3}", 22, NULL, &small, &err), JSON_OK);
  CHECK(small->u.obj.index == NULL);
  CHECK_EQ_INT(json_obj_get(small, "ab")->u.i, 1);
  CHECK_EQ_INT(json_obj_get(small, "abc")->u.i, 2);
  CHECK_EQ_INT(json_obj_get(small, "a")->u.i, 3);
  CHECK(json_obj_get(small, "abcd") == NULL);
  json_value *arr;
  CHECK_EQ_INT(json_parse(a, "[1]", 3, NULL, &arr, &err), JSON_OK);
  CHECK(json_obj_get(arr, "a") == NULL);
  CHECK(json_obj_get(NULL, "a") == NULL);
  json_value *nine;
  CHECK_EQ_INT(json_parse(a, "{\"a\":0,\"b\":1,\"c\":2,\"d\":3,\"e\":4,\"f\":5,\"g\":6,\"h\":7,\"i\":8}", 55, NULL, &nine, &err), JSON_OK);
  CHECK(nine->u.obj.index != NULL);
  CHECK_EQ_INT(json_obj_get(nine, "i")->u.i, 8);
  free(in);
  arena_free(a);
}

static const json_value *must_parse(arena_t *a, const char *s) {
  json_value *v = NULL; json_error err;
  if (json_parse(a, s, strlen(s), NULL, &v, &err) != JSON_OK) { printf("CHECK failed: cannot parse [%s] (%s:%d)\n", s, __FILE__, __LINE__); g_failed = 1; }
  return v;
}

/** @id TEST-PARSE-011 @verifies REQ-PARSE-011 */
TEST(test_parse_011) {
  static const struct { const char *a, *b; int want; } rows[] = {
    {"1", "1.0", 1}, {"-0", "0", 1}, {"0.5", "0.5", 1}, {"{\"a\":1,\"b\":2}", "{\"b\":2,\"a\":1}", 1},
    {"[1,2]", "[2,1]", 0}, {"[1]", "[1,2]", 0}, {"\"a\"", "\"a\"", 1}, {"\"a\"", "\"b\"", 0}, {"\"a\"", "\"ab\"", 0},
    {"null", "false", 0}, {"true", "true", 1}, {"true", "false", 0}, {"{\"a\":1}", "{\"a\":1,\"b\":2}", 0},
    {"{\"a\":1,\"b\":2}", "{\"a\":1,\"c\":2}", 0}, {"9223372036854775807", "9223372036854775808", 0},
    {"9223372036854775808", "9.223372036854775808e18", 1}, {"[[]]", "[{}]", 0}, {"{\"a\":[1,{\"b\":null}]}", "{\"a\":[1.0,{\"b\":null}]}", 1},
    {"1", "\"1\"", 0}, {"[]", "{}", 0}, {"-9223372036854775808", "-9.223372036854775808e18", 1},
  };
  arena_t *a = arena_new(1024);
  for (size_t i = 0; i < sizeof rows / sizeof rows[0]; i++) {
    const json_value *x = must_parse(a, rows[i].a), *y = must_parse(a, rows[i].b);
    if (json_equal(x, y) != rows[i].want || json_equal(y, x) != rows[i].want) {
      printf("CHECK failed: row %zu [%s] vs [%s] want %d (%s:%d)\n", i, rows[i].a, rows[i].b, rows[i].want, __FILE__, __LINE__); g_failed = 1;
    }
  }
  CHECK(json_equal(NULL, NULL) == 1);
  CHECK(json_equal(must_parse(a, "1"), NULL) == 0);
  arena_free(a);
}

/** @id TEST-PARSE-012 @verifies REQ-PARSE-012 */
TEST(test_parse_012) {
  const char *in = "{\"a\": [1,\n  \"x\", null]}";
  arena_t *a = arena_new(1024);
  const json_value *root = must_parse(a, in);
  CHECK(root != NULL);
  if (!root) { arena_free(a); return; }
  CHECK(root->line == 1 && root->col == 1 && root->offset == 0);
  const json_value *arr = json_obj_get(root, "a");
  CHECK(arr != NULL && arr->line == 1 && arr->col == 7 && arr->offset == 6);
  CHECK(arr->u.arr.items[0]->line == 1 && arr->u.arr.items[0]->col == 8 && arr->u.arr.items[0]->offset == 7);
  CHECK(arr->u.arr.items[1]->line == 2 && arr->u.arr.items[1]->col == 3 && arr->u.arr.items[1]->offset == 12);
  CHECK(arr->u.arr.items[2]->line == 2 && arr->u.arr.items[2]->col == 8 && arr->u.arr.items[2]->offset == 17);
  arena_free(a);
}
