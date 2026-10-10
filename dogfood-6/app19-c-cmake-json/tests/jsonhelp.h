#ifndef JSONHELP_H
#define JSONHELP_H
#include "harness.h"
#include "json.h"
#include <stdarg.h>

typedef struct { char *p; size_t n, cap; } sbuf;
static void sb_add(sbuf *b, const char *fmt, ...) {
  va_list ap; va_start(ap, fmt);
  int k = vsnprintf(b->p + b->n, b->cap - b->n, fmt, ap);
  va_end(ap);
  if (k > 0) b->n += (size_t)k;
}

/* null true false i<int> d<double %.17g> "str" [..] {"k":v} */
static void dump_value(sbuf *b, const json_value *v) {
  if (!v) { sb_add(b, "<NULL>"); return; }
  switch (v->type) {
    case JSON_NULL: sb_add(b, "null"); break;
    case JSON_BOOL: sb_add(b, v->u.b ? "true" : "false"); break;
    case JSON_INT: sb_add(b, "i%lld", (long long)v->u.i); break;
    case JSON_DOUBLE: sb_add(b, "d%.17g", v->u.d); break;
    case JSON_STRING: sb_add(b, "\"%.*s\"", (int)v->u.str.len, v->u.str.s); break;
    case JSON_ARRAY:
      sb_add(b, "[");
      for (size_t i = 0; i < v->u.arr.count; i++) { if (i) sb_add(b, ","); dump_value(b, v->u.arr.items[i]); }
      sb_add(b, "]");
      break;
    case JSON_OBJECT:
      sb_add(b, "{");
      for (size_t i = 0; i < v->u.obj.count; i++) {
        if (i) sb_add(b, ",");
        sb_add(b, "\"%.*s\":", (int)v->u.obj.members[i].key_len, v->u.obj.members[i].key);
        dump_value(b, v->u.obj.members[i].value);
      }
      sb_add(b, "}");
      break;
  }
}

/* result: dump of the tree, or ERR_x@line:col+off path=P msg=M */
static void parse_dump_opts(const char *in, size_t len, size_t chunk, const json_opts *opts, char *out, size_t cap) {
  arena_t *a = arena_new(512);
  sbuf b = {out, 0, cap};
  out[0] = 0;
  json_parser *p = jp_new(a, opts);
  json_value *root = NULL;
  json_err e = JSON_OK;
  size_t step = chunk ? chunk : (len ? len : 1);
  for (size_t i = 0; i < len && e == JSON_OK; i += step) e = jp_feed(p, in + i, i + step > len ? len - i : step);
  if (e == JSON_OK) e = jp_finish(p, &root);
  if (e == JSON_OK) dump_value(&b, root);
  else {
    json_error je = jp_error(p);
    if (je.code == JSON_ERR_LEX) sb_add(&b, "ERR_LEX(%s)", lex_err_name(je.lex)); else sb_add(&b, "%s", json_err_name(e));
    sb_add(&b, "@%zu:%zu+%zu path=%s msg=%s", je.line, je.col, je.offset, je.path, je.msg);
  }
  jp_free(p);
  arena_free(a);
}

typedef struct { const char *in; const char *want; } prow;
static void check_rows(const char *file, int line, const prow *rows, size_t n, const json_opts *opts) {
  char out[4096];
  for (size_t i = 0; i < n; i++) {
    parse_dump_opts(rows[i].in, strlen(rows[i].in), 0, opts, out, sizeof out);
    if (strcmp(out, rows[i].want) != 0) { printf("CHECK failed: row %zu input [%s] got [%s] want [%s] (%s:%d)\n", i, rows[i].in, out, rows[i].want, file, line); g_failed = 1; }
  }
}
#endif
