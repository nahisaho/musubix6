#ifndef HARNESS_H
#define HARNESS_H
#include <stdio.h>
#include <string.h>
#define CHECK(c) do { if (!(c)) { fprintf(stderr, "%s:%d CHECK failed: %s\n", __FILE__, __LINE__, #c); return 1; } } while (0)
typedef struct { const char *name; int (*fn)(void); } harness_case;
static int harness_run(const harness_case *cases, int n, int argc, char **argv) {
  int ran = 0, failed = 0;
  for (int i = 0; i < n; i++) {
    if (argc > 1 && strstr(cases[i].name, argv[1]) == NULL) continue;
    ran++;
    if (cases[i].fn() != 0) { fprintf(stderr, "FAIL %s\n", cases[i].name); failed++; }
  }
  if (ran == 0) { fprintf(stderr, "no test matched\n"); return 2; }
  return failed ? 1 : 0;
}
#define RUN_ALL(arr) harness_run(arr, (int)(sizeof(arr) / sizeof(arr[0])), argc, argv)
#endif
