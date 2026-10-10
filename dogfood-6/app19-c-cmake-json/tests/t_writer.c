#include "jsonhelp.h"
#include "writer.h"

typedef struct { char out[8192]; size_t n; int calls, fail_after, attempts; } cap_t;
static int cap_sink(void *ctx, const char *d, size_t len) {
  cap_t *c = ctx;
  c->attempts++;
  if (c->fail_after >= 0 && c->calls >= c->fail_after) return 1;
  c->calls++;
  memcpy(c->out + c->n, d, len); c->n += len; c->out[c->n] = 0;
  return 0;
}

static jw_err write_doc(const char *doc, const jw_opts *o, char *out) {
  arena_t *a = arena_new(1024);
  json_value *v; json_error err;
  cap_t c = {{0}, 0, 0, -1, 0};
  if (json_parse(a, doc, strlen(doc), NULL, &v, &err) != JSON_OK) { printf("CHECK failed: cannot parse [%s] (%s:%d)\n", doc, __FILE__, __LINE__); g_failed = 1; strcpy(out, "PARSEFAIL"); arena_free(a); return JW_OK; }
  jw_err e = json_write(v, o, cap_sink, &c);
  strcpy(out, c.out);
  arena_free(a);
  return e;
}

/** @id TEST-WRITE-001 @verifies REQ-WRITE-001 */
TEST(test_write_001) {
  static const prow rows[] = {
    {"null", "null"}, {"true", "true"}, {"[ 1 , 2 ,3 ]", "[1,2,3]"}, {"{ \"a\" : [ ] , \"b\" : { } }", "{\"a\":[],\"b\":{}}"},
    {"{\"k\":{\"x\":[true,null,\"s\"]}}", "{\"k\":{\"x\":[true,null,\"s\"]}}"}, {"\"hi\"", "\"hi\""}, {"[[[]]]", "[[[]]]"},
  };
  char out[512];
  jw_opts o = {0, 0, 0};
  for (size_t i = 0; i < sizeof rows / sizeof rows[0]; i++) {
    CHECK_EQ_INT(write_doc(rows[i].in, &o, out), JW_OK);
    CHECK_EQ_STR(out, rows[i].want);
  }
  CHECK_EQ_INT(write_doc("[1,{\"a\":2}]", NULL, out), JW_OK);
  CHECK_EQ_STR(out, "[1,{\"a\":2}]");
}

/** @id TEST-WRITE-002 @verifies REQ-WRITE-002 */
TEST(test_write_002) {
  static const struct { const char *in; int indent; const char *want; } rows[] = {
    {"{\"a\":1,\"b\":[1,2],\"c\":{}}", 2, "{\n  \"a\": 1,\n  \"b\": [\n    1,\n    2\n  ],\n  \"c\": {}\n}"},
    {"[]", 2, "[]"}, {"{}", 2, "{}"}, {"[[],{}]", 4, "[\n    [],\n    {}\n]"}, {"\"x\"", 2, "\"x\""},
    {"[1]", 1, "[\n 1\n]"}, {"[[1,[2]]]", 2, "[\n  [\n    1,\n    [\n      2\n    ]\n  ]\n]"},
    {"{\"k\":{\"x\":null}}", 3, "{\n   \"k\": {\n      \"x\": null\n   }\n}"},
  };
  char out[512];
  for (size_t i = 0; i < sizeof rows / sizeof rows[0]; i++) {
    jw_opts o = {rows[i].indent, 0, 0};
    CHECK_EQ_INT(write_doc(rows[i].in, &o, out), JW_OK);
    CHECK_EQ_STR(out, rows[i].want);
  }
}

/** @id TEST-WRITE-003 @verifies REQ-WRITE-003 */
TEST(test_write_003) {
  static const prow rows[] = {
    {"\"a\\\"b\\\\c\\/d\\b\\f\\n\\r\\t\"", "\"a\\\"b\\\\c/d\\b\\f\\n\\r\\t\""},
    {"\"\\u0001\\u001f\\u0000\"", "\"\\u0001\\u001f\\u0000\""},
    {"\"\\u007f\"", "\"\x7f\""},
    {"\"\xc3\xa9\xe2\x82\xac\xf0\x9f\x98\x80\"", "\"\xc3\xa9\xe2\x82\xac\xf0\x9f\x98\x80\""},
    {"{\"a\\\"b\":\"\\n\"}", "{\"a\\\"b\":\"\\n\"}"},
    {"\"\"", "\"\""},
    {"[\"\\u000b\",\"\\u0008\"]", "[\"\\u000b\",\"\\b\"]"},
  };
  char out[512];
  jw_opts o = {0, 0, 0};
  for (size_t i = 0; i < sizeof rows / sizeof rows[0]; i++) {
    CHECK_EQ_INT(write_doc(rows[i].in, &o, out), JW_OK);
    CHECK_EQ_STR(out, rows[i].want);
  }
}

/** @id TEST-WRITE-004 @verifies REQ-WRITE-004 */
TEST(test_write_004) {
  static const prow rows[] = {
    {"\"\xc3\xa9\"", "\"\\u00e9\""}, {"\"\xf0\x9f\x98\x80\"", "\"\\ud83d\\ude00\""}, {"\"\xe2\x82\xac" "a\"", "\"\\u20aca\""},
    {"\"\xef\xbf\xbf\"", "\"\\uffff\""}, {"\"\xf0\x90\x80\x80\"", "\"\\ud800\\udc00\""}, {"\"\xf4\x8f\xbf\xbf\"", "\"\\udbff\\udfff\""},
    {"\"\\u007f\\n\"", "\"\x7f\\n\""}, {"{\"\xc3\xa9\":[\"\xc3\xbc\"]}", "{\"\\u00e9\":[\"\\u00fc\"]}"}, {"\"plain\"", "\"plain\""},
  };
  char out[512];
  jw_opts o = {0, 1, 0};
  for (size_t i = 0; i < sizeof rows / sizeof rows[0]; i++) {
    CHECK_EQ_INT(write_doc(rows[i].in, &o, out), JW_OK);
    CHECK_EQ_STR(out, rows[i].want);
  }
}

/** @id TEST-WRITE-005 @verifies REQ-WRITE-005 */
TEST(test_write_005) {
  static const prow rows[] = {
    {"0", "0"}, {"-12", "-12"}, {"9223372036854775807", "9223372036854775807"}, {"-9223372036854775808", "-9223372036854775808"},
    {"1.5", "1.5"}, {"0.1", "0.1"}, {"100.0", "100.0"}, {"1e2", "100.0"}, {"-0", "-0.0"}, {"-0.0", "-0.0"}, {"0.0", "0.0"},
    {"1e20", "1e+20"}, {"1.7976931348623157e308", "1.7976931348623157e+308"}, {"5e-324", "4.94065645841247e-324"},
    {"0.30000000000000004", "0.30000000000000004"}, {"123456789012345680000", "1.2345678901234568e+20"},
    {"2.2250738585072014e-308", "2.2250738585072014e-308"}, {"[1,2.5,-3]", "[1,2.5,-3]"}, {"1e-7", "1e-07"},
  };
  char out[512];
  jw_opts o = {0, 0, 0};
  for (size_t i = 0; i < sizeof rows / sizeof rows[0]; i++) {
    CHECK_EQ_INT(write_doc(rows[i].in, &o, out), JW_OK);
    if (strcmp(out, rows[i].want) != 0) { printf("CHECK failed: row %zu [%s] got [%s] want [%s] (%s:%d)\n", i, rows[i].in, out, rows[i].want, __FILE__, __LINE__); g_failed = 1; }
  }
  cap_t c = {{0}, 0, 0, -1, 0};
  json_writer *w = jw_new(&o, cap_sink, &c);
  CHECK_EQ_INT(jw_int(w, INT64_MIN), JW_OK);
  CHECK_EQ_STR(c.out, "-9223372036854775808");
  jw_free(w);
  static const double bad[] = {0.0 / 0.0, 1.0 / 0.0, -1.0 / 0.0};
  for (size_t i = 0; i < 3; i++) {
    cap_t c2 = {{0}, 0, 0, -1, 0};
    json_writer *w2 = jw_new(&o, cap_sink, &c2);
    CHECK_EQ_INT(jw_begin_array(w2), JW_OK);
    CHECK_EQ_INT(jw_double(w2, bad[i]), JW_ERR_NONFINITE);
    CHECK_EQ_INT(jw_null(w2), JW_ERR_NONFINITE); /* sticky */
    jw_free(w2);
    json_value v; memset(&v, 0, sizeof v); v.type = JSON_DOUBLE; v.u.d = bad[i];
    cap_t c3 = {{0}, 0, 0, -1, 0};
    CHECK_EQ_INT(json_write(&v, &o, cap_sink, &c3), JW_ERR_NONFINITE);
  }
}

/** @id TEST-WRITE-006 @verifies REQ-WRITE-006 */
TEST(test_write_006) {
  arena_t *a = arena_new(256);
  json_value *v; json_error err;
  CHECK_EQ_INT(json_parse(a, "[1,2,3]", 7, NULL, &v, &err), JSON_OK);
  jw_opts o = {0, 0, 0};
  static const struct { size_t cap; const char *want; } rows[] = {{64, "[1,2,3]"}, {8, "[1,2,3]"}, {7, "[1,2,3"}, {4, "[1,"}, {2, "["}, {1, ""}};
  for (size_t i = 0; i < sizeof rows / sizeof rows[0]; i++) {
    char buf[64]; memset(buf, 'X', sizeof buf);
    size_t need = 0;
    CHECK_EQ_INT(json_write_buf(v, &o, buf, rows[i].cap, &need), JW_OK);
    CHECK_EQ_INT(need, 7);
    CHECK_EQ_STR(buf, rows[i].want);
    CHECK_EQ_INT(buf[rows[i].cap < 64 ? rows[i].cap : 63] == 'X' || rows[i].cap >= 64, 1);
  }
  char buf[4] = {'X', 'X', 'X', 'X'};
  size_t need = 0;
  CHECK_EQ_INT(json_write_buf(v, &o, buf, 0, &need), JW_OK);
  CHECK_EQ_INT(need, 7);
  CHECK(buf[0] == 'X');
  CHECK_EQ_INT(json_write_buf(v, &o, NULL, 0, &need), JW_OK);
  CHECK_EQ_INT(need, 7);
  arena_free(a);
}

/** @id TEST-WRITE-007 @verifies REQ-WRITE-007 */
TEST(test_write_007) {
  static const prow rows[] = {
    {"{\"b\":1,\"a\":{\"z\":1,\"y\":2},\"c\":[{\"b\":1,\"a\":2}]}", "{\"a\":{\"y\":2,\"z\":1},\"b\":1,\"c\":[{\"a\":2,\"b\":1}]}"},
    {"{\"a\":1,\"ab\":2,\"B\":3,\"\":4}", "{\"\":4,\"B\":3,\"a\":1,\"ab\":2}"},
    {"[3,{\"y\":0,\"x\":1}]", "[3,{\"x\":1,\"y\":0}]"},
    {"{}", "{}"},
  };
  arena_t *a = arena_new(1024);
  for (size_t i = 0; i < sizeof rows / sizeof rows[0]; i++) {
    json_value *v; json_error err;
    CHECK_EQ_INT(json_parse(a, rows[i].in, strlen(rows[i].in), NULL, &v, &err), JSON_OK);
    char sorted[512], plain[512];
    jw_opts so = {0, 0, 1}, po = {0, 0, 0};
    cap_t c1 = {{0}, 0, 0, -1, 0}, c2 = {{0}, 0, 0, -1, 0};
    CHECK_EQ_INT(json_write(v, &so, cap_sink, &c1), JW_OK);
    strcpy(sorted, c1.out);
    CHECK_EQ_STR(sorted, rows[i].want);
    CHECK_EQ_INT(json_write(v, &po, cap_sink, &c2), JW_OK);
    strcpy(plain, c2.out);
    CHECK_EQ_STR(plain, rows[i].in); /* tree untouched: original order still written */
  }
  arena_free(a);
}

static void ev_run(const char *seq, char *out, int *err_at, int *sticky_ok) {
  cap_t c = {{0}, 0, 0, -1, 0};
  jw_opts o = {0, 0, 0};
  json_writer *w = jw_new(&o, cap_sink, &c);
  *err_at = -1; *sticky_ok = 1;
  size_t bytes_at_err = 0;
  for (size_t i = 0; seq[i]; i++) {
    jw_err e = JW_OK;
    switch (seq[i]) {
      case '{': e = jw_begin_object(w); break;
      case '[': e = jw_begin_array(w); break;
      case '}': e = jw_end(w, '}'); break;
      case ']': e = jw_end(w, ']'); break;
      case 'k': e = jw_key(w, "k", 1); break;
      case 'n': e = jw_null(w); break;
      case 'b': e = jw_bool(w, 1); break;
      case 'i': e = jw_int(w, 1); break;
      case 's': e = jw_string(w, "s", 1); break;
      case 'f': e = jw_finish(w); break;
    }
    if (*err_at < 0 && e != JW_OK) { *err_at = (int)i; bytes_at_err = c.n; if (e != JW_ERR_STATE) *sticky_ok = 0; }
    else if (*err_at >= 0 && e != JW_ERR_STATE) *sticky_ok = 0;
  }
  if (*err_at >= 0 && c.n != bytes_at_err) *sticky_ok = 0;
  strcpy(out, c.out);
  jw_free(w);
}

/** @id TEST-WRITE-008 @verifies REQ-WRITE-008 */
TEST(test_write_008) {
  static const struct { const char *seq; int err_at; const char *out; } rows[] = {
    {"{kn}f", -1, "{\"k\":null}"}, {"[i{kn}]f", -1, "[1,{\"k\":null}]"}, {"[{k[b]}s]f", -1, "[{\"k\":[true]},\"s\"]"},
    {"nf", -1, "null"}, {"sf", -1, "\"s\""}, {"{}f", -1, "{}"}, {"[]f", -1, "[]"}, {"{k{}}f", -1, "{\"k\":{}}"},
    {"k", 0, ""}, {"[k", 1, "["}, {"{n", 1, "{"}, {"{kk", 2, "{\"k\":"}, {"{k}", 2, "{\"k\":"}, {"[}", 1, "["}, {"{]", 1, "{"},
    {"}", 0, ""}, {"nn", 1, "null"}, {"[]n", 2, "[]"}, {"[f", 1, "["}, {"f", 0, ""}, {"{k[}", 3, "{\"k\":["}, {"{{", 1, "{"},
    {"{kn[", 3, "{\"k\":null"}, {"{ks]", 3, "{\"k\":\"s\""},
  };
  for (size_t i = 0; i < sizeof rows / sizeof rows[0]; i++) {
    char out[256]; int at, sticky;
    ev_run(rows[i].seq, out, &at, &sticky);
    if (at != rows[i].err_at || strcmp(out, rows[i].out) != 0 || !sticky) {
      printf("CHECK failed: seq [%s] err_at %d (want %d) out [%s] (want [%s]) sticky %d (%s:%d)\n", rows[i].seq, at, rows[i].err_at, out, rows[i].out, sticky, __FILE__, __LINE__);
      g_failed = 1;
    }
  }
}

/** @id TEST-WRITE-009 @verifies REQ-WRITE-009 */
TEST(test_write_009) {
  static const char *docs[] = {
    "null", "[1,2,3]", "{\"a\":{\"b\":[true,false,null,\"x\\ny\\u0001\"]},\"c\":-0.5}", "[\"\xc3\xa9\xf0\x9f\x98\x80\"]",
    "[0.1,1e-7,123456.789,5e-324,1.7976931348623157e308,2.2250738585072014e-308,4.35,1e22,-1e-5,0.30000000000000004]",
    "[9007199254740993,9007199254740993.0,-9223372036854775808,9223372036854775807,9223372036854775808]",
    "{\"z\":[],\"a\":{},\"m\":[[],[[]],{}]}", "[-0,0,0.0,1.0,100,1e2]", "\"\\\\ \\\" / \\u001f\"",
  };
  static const jw_opts variants[] = {{0, 0, 0}, {2, 0, 0}, {0, 1, 0}, {4, 1, 1}, {0, 0, 1}};
  arena_t *a = arena_new(1024);
  for (size_t d = 0; d < sizeof docs / sizeof docs[0]; d++) {
    json_value *v; json_error err;
    CHECK_EQ_INT(json_parse(a, docs[d], strlen(docs[d]), NULL, &v, &err), JSON_OK);
    for (size_t k = 0; k < sizeof variants / sizeof variants[0]; k++) {
      cap_t c = {{0}, 0, 0, -1, 0};
      CHECK_EQ_INT(json_write(v, &variants[k], cap_sink, &c), JW_OK);
      json_value *back = NULL;
      json_err pe = json_parse(a, c.out, c.n, NULL, &back, &err);
      if (pe != JSON_OK || !json_equal(v, back)) { printf("CHECK failed: doc %zu variant %zu roundtrip of [%s] -> [%s] (%s:%d)\n", d, k, docs[d], c.out, __FILE__, __LINE__); g_failed = 1; }
    }
  }
  json_value *v; json_error err;
  const char *dd = "[0.1,5e-324,1.7976931348623157e308,0.30000000000000004,-1e-5,4.35]";
  CHECK_EQ_INT(json_parse(a, dd, strlen(dd), NULL, &v, &err), JSON_OK);
  cap_t c = {{0}, 0, 0, -1, 0};
  jw_opts o = {0, 0, 0};
  CHECK_EQ_INT(json_write(v, &o, cap_sink, &c), JW_OK);
  json_value *back; CHECK_EQ_INT(json_parse(a, c.out, c.n, NULL, &back, &err), JSON_OK);
  for (size_t i = 0; i < v->u.arr.count; i++) CHECK(memcmp(&v->u.arr.items[i]->u.d, &back->u.arr.items[i]->u.d, sizeof(double)) == 0);
  arena_free(a);
}

/** @id TEST-WRITE-010 @verifies REQ-WRITE-010 */
TEST(test_write_010) {
  const char *doc = "{\"a\":[1,2,3],\"b\":\"x\"}";
  arena_t *a = arena_new(512);
  json_value *v; json_error err;
  CHECK_EQ_INT(json_parse(a, doc, strlen(doc), NULL, &v, &err), JSON_OK);
  jw_opts o = {2, 0, 0};
  cap_t full = {{0}, 0, 0, -1, 0};
  CHECK_EQ_INT(json_write(v, &o, cap_sink, &full), JW_OK);
  CHECK(full.calls >= 2);
  for (int n = 0; n < full.calls; n++) {
    cap_t c = {{0}, 0, 0, n, 0};
    CHECK_EQ_INT(json_write(v, &o, cap_sink, &c), JW_ERR_SINK);
    CHECK_EQ_INT(c.attempts, n + 1);
    CHECK_EQ_INT(c.calls, n);
  }
  cap_t c = {{0}, 0, 0, 1, 0};
  json_writer *w = jw_new(&o, cap_sink, &c);
  CHECK_EQ_INT(jw_begin_array(w), JW_OK);
  jw_err e = JW_OK;
  for (int i = 0; i < 5 && e == JW_OK; i++) e = jw_int(w, i);
  CHECK_EQ_INT(e, JW_ERR_SINK);
  int attempts = c.attempts;
  CHECK_EQ_INT(jw_int(w, 9), JW_ERR_SINK);
  CHECK_EQ_INT(jw_finish(w), JW_ERR_SINK);
  CHECK_EQ_INT(c.attempts, attempts);
  jw_free(w);
  arena_free(a);
}
