#ifndef HARNESS_H
#define HARNESS_H
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef void (*test_fn)(void);
typedef struct { const char *name; test_fn fn; } test_entry;
#define MAX_TESTS 128
static test_entry g_tests[MAX_TESTS];
static int g_ntests;
static int g_failed;

static void register_test(const char *name, test_fn fn) { g_tests[g_ntests].name = name; g_tests[g_ntests++].fn = fn; }

#define TEST(fname) \
  static void fname(void); \
  __attribute__((constructor)) static void reg_##fname(void) { register_test(#fname, fname); } \
  static void fname(void)

#define CHECK(c) do { if (!(c)) { printf("CHECK failed: %s (%s:%d)\n", #c, __FILE__, __LINE__); g_failed = 1; } } while (0)
#define CHECK_EQ_INT(a, b) do { long long _a = (long long)(a), _b = (long long)(b); if (_a != _b) { printf("CHECK failed: %s == %s (got %lld, want %lld) (%s:%d)\n", #a, #b, _a, _b, __FILE__, __LINE__); g_failed = 1; } } while (0)
#define CHECK_EQ_STR(a, b) do { const char *_a = (a), *_b = (b); if (!_a || !_b || strcmp(_a, _b) != 0) { printf("CHECK failed: %s == %s (got \"%s\", want \"%s\") (%s:%d)\n", #a, #b, _a ? _a : "(null)", _b ? _b : "(null)", __FILE__, __LINE__); g_failed = 1; } } while (0)

int main(int argc, char **argv) {
  int ran = 0;
  for (int i = 0; i < g_ntests; i++) {
    if (argc > 1 && strcmp(argv[1], g_tests[i].name) != 0) continue;
    g_tests[i].fn(); ran++;
  }
  if (!ran) { printf("no test matched\n"); return 2; }
  return g_failed;
}
#endif
