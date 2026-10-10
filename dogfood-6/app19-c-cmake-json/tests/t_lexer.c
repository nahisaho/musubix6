#include "lexhelp.h"

typedef struct { const char *in; size_t len; const char *want; } lrow;
#define ROW(s, w) { s, sizeof(s) - 1, w }

static void run_rows(const lrow *rows, size_t n, int positions) {
  transcript t;
  for (size_t i = 0; i < n; i++) {
    lex_run(rows[i].in, rows[i].len, 0, 0, positions, &t);
    if (strcmp(t.out, rows[i].want) != 0) {
      printf("CHECK failed: row %zu input [%s] got [%s] want [%s] (%s:%d)\n", i, rows[i].in, t.out, rows[i].want, __FILE__, __LINE__);
      g_failed = 1;
    }
  }
}
#define RUN_ROWS(rows, pos) run_rows(rows, sizeof(rows) / sizeof((rows)[0]), pos)

/** @id TEST-LEX-001 @verifies REQ-LEX-001 */
TEST(test_lex_001) {
  static const lrow docs[] = {
    ROW("{\"a\": [1, 2.5e-3, true, null], \"b\\u00e9\\ud83d\\ude00\": \"x\\ny\"}", ""),
    ROW("[\"caf\xc3\xa9\", -0, 10, false]\n", ""),
    ROW("[1, 2,, tru]", ""),
    ROW("\"ab\x01\"", ""),
    ROW("12", ""),
    ROW("[\"\xf0\x9f\x98\x80\"", ""),
  };
  transcript whole, part;
  for (size_t d = 0; d < sizeof docs / sizeof docs[0]; d++) {
    lex_err ew = lex_run(docs[d].in, docs[d].len, 0, 0, 1, &whole);
    for (size_t chunk = 1; chunk <= 7; chunk++) {
      lex_err ep = lex_run(docs[d].in, docs[d].len, chunk, 0, 1, &part);
      if (ep != ew || strcmp(whole.out, part.out) != 0) {
        printf("CHECK failed: doc %zu chunk %zu: [%s] vs whole [%s] (%s:%d)\n", d, chunk, part.out, whole.out, __FILE__, __LINE__);
        g_failed = 1;
      }
    }
  }
  lex_run(docs[0].in, docs[0].len, 1, 0, 0, &part);
  CHECK_EQ_STR(part.out, "{ S\"a\" : [ I1 , N2.5e-3 , true , null ] , S\"b\xc3\xa9\xf0\x9f\x98\x80\" : S\"x\\x0Ay\" } EOF");
  lex_run(docs[2].in, docs[2].len, 3, 0, 0, &part);
  CHECK_EQ_STR(part.out, "[ I1 , I2 , , ERR_LITERAL@1:12+11");
}

/** @id TEST-LEX-002 @verifies REQ-LEX-002 */
TEST(test_lex_002) {
  static const lrow rows[] = {
    ROW("{}[]:,", "{ } [ ] : , EOF"),
    ROW(" \t\r\n{ \n}\t", "{ } EOF"),
    ROW("true false null", "true false null EOF"),
    ROW("[true,false,null]", "[ true , false , null ] EOF"),
    ROW("", "EOF"),
    ROW("   ", "EOF"),
    ROW("\f", "ERR_CHAR@1:1+0"),
    ROW("\xc2\xa0", "ERR_CHAR@1:1+0"),
    ROW("[tru e]", "[ ERR_LITERAL@1:5+4"),
    ROW("truex", "ERR_LITERAL@1:5+4"),
    ROW("'a'", "ERR_CHAR@1:1+0"),
  };
  RUN_ROWS(rows, 0);
}

/** @id TEST-LEX-003 @verifies REQ-LEX-003 */
TEST(test_lex_003) {
  static const lrow rows[] = {
    ROW("\"\"", "S\"\" EOF"),
    ROW("\"abc\"", "S\"abc\" EOF"),
    ROW("\"a\\\"b\"", "S\"a\\x22b\" EOF"),
    ROW("\"\\\\\"", "S\"\\x5C\" EOF"),
    ROW("\"\\/\\b\\f\\n\\r\\t\"", "S\"/\\x08\\x0C\\x0A\\x0D\\x09\" EOF"),
    ROW("\"\\u0041\\u00e9\"", "S\"A\xc3\xa9\" EOF"),
    ROW("\"\\u20AC\"", "S\"\xe2\x82\xac\" EOF"),
    ROW("\"\\uD83D\\uDE00\"", "S\"\xf0\x9f\x98\x80\" EOF"),
    ROW("\"\\ud834\\udd1e!\"", "S\"\xf0\x9d\x84\x9e!\" EOF"),
    ROW("\"\\u0000x\"", "S\"\\x00x\" EOF"),
    ROW("\"\xe2\x82\xac\xf0\x9f\x98\x80\"", "S\"\xe2\x82\xac\xf0\x9f\x98\x80\" EOF"),
  };
  RUN_ROWS(rows, 0);
}

/** @id TEST-LEX-004 @verifies REQ-LEX-004 */
TEST(test_lex_004) {
  static const lrow rows[] = {
    ROW("\"\\q\"", "ERR_ESCAPE@1:3+2"),
    ROW("\"\\u12\"", "ERR_ESCAPE@1:6+5"),
    ROW("\"\\u12G4\"", "ERR_ESCAPE@1:6+5"),
    ROW("\"\\ud800\"", "ERR_SURROGATE@1:8+7"),
    ROW("\"\\ud800x\"", "ERR_SURROGATE@1:8+7"),
    ROW("\"\\ud800\\n\"", "ERR_SURROGATE@1:9+8"),
    ROW("\"\\ud800\\u0041\"", "ERR_SURROGATE@1:13+12"),
    ROW("\"\\udc00\"", "ERR_SURROGATE@1:7+6"),
    ROW("\"\\ud800\\udbff\"", "ERR_SURROGATE@1:13+12"),
    ROW("\"\\uD7FF\\uE000\"", "S\"\xed\x9f\xbf\xee\x80\x80\" EOF"),
  };
  RUN_ROWS(rows, 0);
}

/** @id TEST-LEX-005 @verifies REQ-LEX-005 */
TEST(test_lex_005) {
  static const lrow rows[] = {
    ROW("\"a\x01\"", "ERR_CTRL@1:3+2"),
    ROW("\"\n\"", "ERR_CTRL@1:2+1"),
    ROW("\"x\ty\"", "ERR_CTRL@1:3+2"),
    ROW("\"\x1f\"", "ERR_CTRL@1:2+1"),
    ROW("\"\x7f\"", "S\"\x7f\" EOF"),
    ROW("\"\\n\"", "S\"\\x0A\" EOF"),
    ROW("[\"a\",\n\"b\x00\"]", "[ S\"a\" , ERR_CTRL@2:3+8"),
  };
  transcript t;
  for (size_t i = 0; i < sizeof rows / sizeof rows[0]; i++) {
    lex_run(rows[i].in, rows[i].len, 0, 0, 0, &t);
    if (strcmp(t.out, rows[i].want) != 0) { printf("CHECK failed: row %zu got [%s] want [%s] (%s:%d)\n", i, t.out, rows[i].want, __FILE__, __LINE__); g_failed = 1; }
  }
}

/** @id TEST-LEX-006 @verifies REQ-LEX-006 */
TEST(test_lex_006) {
  static const lrow rows[] = {
    ROW("\"\x80\"", "ERR_UTF8@1:2+1"),
    ROW("\"\xbf\"", "ERR_UTF8@1:2+1"),
    ROW("\"\xc0\x80\"", "ERR_UTF8@1:2+1"),
    ROW("\"\xc1\xbf\"", "ERR_UTF8@1:2+1"),
    ROW("\"\xe0\x80\x80\"", "ERR_UTF8@1:3+2"),
    ROW("\"\xe0\x9f\xbf\"", "ERR_UTF8@1:3+2"),
    ROW("\"\xed\xa0\x80\"", "ERR_UTF8@1:3+2"),
    ROW("\"\xf0\x80\x80\x80\"", "ERR_UTF8@1:3+2"),
    ROW("\"\xf4\x90\x80\x80\"", "ERR_UTF8@1:3+2"),
    ROW("\"\xf5\x80\x80\x80\"", "ERR_UTF8@1:2+1"),
    ROW("\"\xff\"", "ERR_UTF8@1:2+1"),
    ROW("\"\xc3\"", "ERR_UTF8@1:3+2"),
    ROW("\"\xe2\x82\"", "ERR_UTF8@1:4+3"),
    ROW("\"\xe2\x28\xa1\"", "ERR_UTF8@1:3+2"),
    ROW("\"\xed\x9f\xbf\xf4\x8f\xbf\xbf\xc2\x80\"", "S\"\xed\x9f\xbf\xf4\x8f\xbf\xbf\xc2\x80\" EOF"),
    ROW("\xc3\xa9", "ERR_CHAR@1:1+0"),
  };
  RUN_ROWS(rows, 0);
}

/** @id TEST-LEX-007 @verifies REQ-LEX-007 */
TEST(test_lex_007) {
  static const lrow rows[] = {
    ROW("0", "I0 EOF"), ROW("-0", "I-0 EOF"), ROW("7", "I7 EOF"), ROW("-123", "I-123 EOF"),
    ROW("1.5", "N1.5 EOF"), ROW("0.25", "N0.25 EOF"), ROW("-0.0", "N-0.0 EOF"),
    ROW("1e5", "N1e5 EOF"), ROW("1E+5", "N1E+5 EOF"), ROW("1.5e-10", "N1.5e-10 EOF"), ROW("0e0", "N0e0 EOF"),
    ROW("01", "ERR_NUMBER@1:2+1"), ROW("-01", "ERR_NUMBER@1:3+2"), ROW("00", "ERR_NUMBER@1:2+1"),
    ROW("+1", "ERR_CHAR@1:1+0"), ROW(".5", "ERR_CHAR@1:1+0"),     ROW("-a", "ERR_NUMBER@1:2+1"), ROW("1.e3", "ERR_NUMBER@1:3+2"),
    ROW("1e+x", "ERR_NUMBER@1:4+3"),
    ROW("[1,2]", "[ I1 , I2 ] EOF"), ROW("[1.5,-2e2]", "[ N1.5 , N-2e2 ] EOF"), ROW("1 2", "I1 I2 EOF"),
    ROW("12abc", "I12 ERR_CHAR@1:3+2"),
  };
  RUN_ROWS(rows, 0);
}

/** @id TEST-LEX-008 @verifies REQ-LEX-008 */
TEST(test_lex_008) {
  static const lrow rows[] = {
    ROW("{\"a\":12,\n  \"b\" : [true]\n}",
        "{@1:1+0 S\"a\"@1:2+1 :@1:5+4 I12@1:6+5 ,@1:8+7 S\"b\"@2:3+11 :@2:7+15 [@2:9+17 true@2:10+18 ]@2:14+22 }@3:1+24 EOF@3:2+25"),
    ROW("12,3", "I12@1:1+0 ,@1:3+2 I3@1:4+3 EOF@1:5+4"),
    ROW("\r\n\r\nnull", "null@3:1+4 EOF@3:5+8"),
    ROW("[\n\n  x", "[@1:1+0 ERR_CHAR@3:3+5"),
    ROW("\"\xc3\xa9\" 1", "S\"\xc3\xa9\"@1:1+0 I1@1:6+5 EOF@1:7+6"),
  };
  RUN_ROWS(rows, 1);
}

/** @id TEST-LEX-009 @verifies REQ-LEX-009 */
TEST(test_lex_009) {
  static const lrow rows[] = {
    ROW("\"abc", "ERR_EOF@1:5+4"),
    ROW("\"abc\\", "ERR_EOF@1:6+5"),
    ROW("\"\\u00", "ERR_EOF@1:6+5"),
    ROW("\"\\ud83d", "ERR_EOF@1:8+7"),
    ROW("tr", "ERR_EOF@1:3+2"),
    ROW("[nul", "[ ERR_EOF@1:5+4"),
    ROW("-", "ERR_EOF@1:2+1"),
    ROW("1.", "ERR_EOF@1:3+2"),
    ROW("1e+", "ERR_EOF@1:4+3"),
    ROW("12", "I12 EOF"),
    ROW("-0.5e1", "N-0.5e1 EOF"),
    ROW("[1", "[ I1 EOF"),
  };
  RUN_ROWS(rows, 0);
  json_lexer *lx = lex_new(NULL, NULL, 0);
  CHECK(lx != NULL);
  CHECK_EQ_INT(lex_finish(lx), LEX_OK);
  CHECK_EQ_INT(lex_feed(lx, "1", 1), LEX_ERR_STATE);
  lex_free(lx);
}

/** @id TEST-LEX-010 @verifies REQ-LEX-010 */
TEST(test_lex_010) {
  transcript t;
  lex_run("\"abcd\"", 6, 0, 4, 0, &t);
  CHECK_EQ_STR(t.out, "S\"abcd\" EOF");
  lex_run("\"abcde\"", 7, 0, 4, 0, &t);
  CHECK_EQ_STR(t.out, "ERR_TOOLONG@1:6+5");
  lex_run("\"\\u20ac\"", 8, 0, 2, 0, &t);
  CHECK_EQ_STR(t.out, "ERR_TOOLONG@1:7+6");
  lex_run("123456", 6, 0, 5, 0, &t);
  CHECK_EQ_STR(t.out, "ERR_TOOLONG@1:6+5");
  lex_run("12345", 5, 0, 5, 0, &t);
  CHECK_EQ_STR(t.out, "I12345 EOF");
  lex_run("tru", 3, 0, 0, 0, &t);
  CHECK_EQ_STR(t.out, "ERR_EOF@1:4+3");
  lex_run("nulL", 4, 0, 0, 0, &t);
  CHECK_EQ_STR(t.out, "ERR_LITERAL@1:4+3");
  lex_run("falsy", 5, 0, 0, 0, &t);
  CHECK_EQ_STR(t.out, "ERR_LITERAL@1:5+4");
  lex_run("[1,\"abcdefgh\"]", 14, 1, 3, 0, &t);
  CHECK_EQ_STR(t.out, "[ I1 , ERR_TOOLONG@1:8+7");
}
