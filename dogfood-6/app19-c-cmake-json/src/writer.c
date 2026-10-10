#include "writer.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct { char kind; int first; } wlevel; /* kind: '{' or '[' */

struct json_writer {
  jw_opts opts;
  jw_sink sink; void *ctx;
  wlevel *stack; size_t depth, cap;
  int key_pending, top_done;
  jw_err err;
};

const char *jw_err_name(jw_err e) {
  static const char *n[] = {"OK", "ERR_NONFINITE", "ERR_STATE", "ERR_SINK", "ERR_NOMEM"};
  return (unsigned)e < sizeof n / sizeof n[0] ? n[e] : "?";
}

json_writer *jw_new(const jw_opts *opts, jw_sink sink, void *ctx) {
  json_writer *w = calloc(1, sizeof *w);
  if (!w) return NULL;
  if (opts) w->opts = *opts;
  w->sink = sink; w->ctx = ctx;
  return w;
}

void jw_free(json_writer *w) { if (w) { free(w->stack); free(w); } }

static jw_err set_err(json_writer *w, jw_err e) { if (!w->err) w->err = e; return w->err; }

static jw_err emit(json_writer *w, const char *s, size_t n) {
  if (w->err) return w->err;
  if (n && w->sink && w->sink(w->ctx, s, n)) return set_err(w, JW_ERR_SINK);
  return JW_OK;
}

static jw_err newline_indent(json_writer *w, size_t levels) {
  if (w->opts.indent <= 0) return JW_OK;
  jw_err e = emit(w, "\n", 1);
  static const char spaces[] = "                                ";
  size_t total = levels * (size_t)w->opts.indent;
  while (!e && total) {
    size_t k = total < sizeof spaces - 1 ? total : sizeof spaces - 1;
    e = emit(w, spaces, k);
    total -= k;
  }
  return e;
}

/** @id CODE-WRITE-001 @implements REQ-WRITE-008 */
static jw_err before_value(json_writer *w) {
  if (w->err) return w->err;
  if (!w->depth) {
    if (w->top_done) return set_err(w, JW_ERR_STATE);
    return JW_OK;
  }
  wlevel *l = &w->stack[w->depth - 1];
  if (l->kind == '{') {
    if (!w->key_pending) return set_err(w, JW_ERR_STATE);
    w->key_pending = 0;
    return JW_OK;
  }
  jw_err e = JW_OK;
  if (!l->first) e = emit(w, ",", 1);
  l->first = 0;
  return e ? e : newline_indent(w, w->depth);
}

static void after_value(json_writer *w) { if (!w->depth) w->top_done = 1; }

static jw_err begin(json_writer *w, char kind) {
  jw_err e = before_value(w);
  if (e) return e;
  if (w->depth == w->cap) {
    size_t nc = w->cap ? w->cap * 2 : 16;
    wlevel *ns = realloc(w->stack, nc * sizeof *ns);
    if (!ns) return set_err(w, JW_ERR_NOMEM);
    w->stack = ns; w->cap = nc;
  }
  w->stack[w->depth].kind = kind; w->stack[w->depth].first = 1; w->depth++;
  return emit(w, kind == '{' ? "{" : "[", 1);
}

jw_err jw_begin_object(json_writer *w) { return begin(w, '{'); }
jw_err jw_begin_array(json_writer *w) { return begin(w, '['); }

jw_err jw_end(json_writer *w, char close) {
  if (w->err) return w->err;
  if (!w->depth || w->key_pending) return set_err(w, JW_ERR_STATE);
  wlevel l = w->stack[w->depth - 1];
  if ((close == '}' && l.kind != '{') || (close == ']' && l.kind != '[') || (close != '}' && close != ']')) return set_err(w, JW_ERR_STATE);
  w->depth--;
  jw_err e = JW_OK;
  if (!l.first) e = newline_indent(w, w->depth);
  if (!e) e = emit(w, close == '}' ? "}" : "]", 1);
  after_value(w);
  return e;
}

/** @id CODE-WRITE-002 @implements REQ-WRITE-003 REQ-WRITE-004 */
static jw_err write_string(json_writer *w, const char *s, size_t len) {
  static const char hex[] = "0123456789abcdef";
  jw_err e = emit(w, "\"", 1);
  size_t run = 0;
  for (size_t i = 0; i < len && !e;) {
    unsigned char c = (unsigned char)s[i];
    char esc[16]; size_t en = 0;
    size_t adv = 1;
    if (c == '"') { memcpy(esc, "\\\"", 2); en = 2; }
    else if (c == '\\') { memcpy(esc, "\\\\", 2); en = 2; }
    else if (c == '\b') { memcpy(esc, "\\b", 2); en = 2; }
    else if (c == '\f') { memcpy(esc, "\\f", 2); en = 2; }
    else if (c == '\n') { memcpy(esc, "\\n", 2); en = 2; }
    else if (c == '\r') { memcpy(esc, "\\r", 2); en = 2; }
    else if (c == '\t') { memcpy(esc, "\\t", 2); en = 2; }
    else if (c < 0x20) { memcpy(esc, "\\u00", 4); esc[4] = hex[c >> 4]; esc[5] = hex[c & 15]; en = 6; }
    else if (c >= 0x80 && w->opts.ascii_only) {
      unsigned cp; size_t n;
      if (c >= 0xF0) { cp = c & 7; n = 4; } else if (c >= 0xE0) { cp = c & 15; n = 3; } else { cp = c & 31; n = 2; }
      for (size_t k = 1; k < n && i + k < len; k++) cp = cp << 6 | ((unsigned char)s[i + k] & 63);
      adv = n;
      if (cp >= 0x10000) {
        unsigned v = cp - 0x10000, hi = 0xD800 + (v >> 10), lo = 0xDC00 + (v & 0x3FF);
        snprintf(esc, sizeof esc, "\\u%04x\\u%04x", hi, lo); en = 12;
      } else { snprintf(esc, sizeof esc, "\\u%04x", cp); en = 6; }
    }
    if (!en) { run++; i++; continue; }
    if (run) e = emit(w, s + i - run, run);
    run = 0;
    if (!e) e = emit(w, esc, en);
    i += adv;
  }
  if (!e && run) e = emit(w, s + len - run, run);
  return e ? e : emit(w, "\"", 1);
}

jw_err jw_key(json_writer *w, const char *key, size_t len) {
  if (w->err) return w->err;
  if (!w->depth || w->stack[w->depth - 1].kind != '{' || w->key_pending) return set_err(w, JW_ERR_STATE);
  wlevel *l = &w->stack[w->depth - 1];
  jw_err e = JW_OK;
  if (!l->first) e = emit(w, ",", 1);
  l->first = 0;
  if (!e) e = newline_indent(w, w->depth);
  if (!e) e = write_string(w, key, len);
  if (!e) e = emit(w, w->opts.indent > 0 ? ": " : ":", w->opts.indent > 0 ? 2 : 1);
  w->key_pending = 1;
  return e;
}

static jw_err scalar(json_writer *w, const char *s, size_t n) {
  jw_err e = before_value(w);
  if (!e) e = emit(w, s, n);
  after_value(w);
  return e;
}

jw_err jw_null(json_writer *w) { return scalar(w, "null", 4); }
jw_err jw_bool(json_writer *w, int b) { return b ? scalar(w, "true", 4) : scalar(w, "false", 5); }

jw_err jw_int(json_writer *w, int64_t i) {
  char buf[24];
  int n = snprintf(buf, sizeof buf, "%lld", (long long)i);
  return scalar(w, buf, (size_t)n);
}

/** @id CODE-WRITE-003 @implements REQ-WRITE-005 */
jw_err jw_double(json_writer *w, double d) {
  if (w->err) return w->err;
  if (!isfinite(d)) return set_err(w, JW_ERR_NONFINITE);
  char buf[40];
  int n = 0;
  for (int prec = 15; prec <= 17; prec++) {
    n = snprintf(buf, sizeof buf, "%.*g", prec, d);
    if (strtod(buf, NULL) == d) break;
  }
  if (!strpbrk(buf, ".e")) { memcpy(buf + n, ".0", 3); n += 2; }
  return scalar(w, buf, (size_t)n);
}

jw_err jw_string(json_writer *w, const char *s, size_t len) {
  jw_err e = before_value(w);
  if (!e) e = write_string(w, s, len);
  after_value(w);
  return e;
}

jw_err jw_finish(json_writer *w) {
  if (w->err) return w->err;
  if (w->depth || !w->top_done) return set_err(w, JW_ERR_STATE);
  return JW_OK;
}

typedef struct { const json_member *m; } mref;

static int cmp_member(const void *a, const void *b) {
  const json_member *x = *(const json_member *const *)a, *y = *(const json_member *const *)b;
  size_t n = x->key_len < y->key_len ? x->key_len : y->key_len;
  int c = n ? memcmp(x->key, y->key, n) : 0;
  if (c) return c;
  return x->key_len < y->key_len ? -1 : x->key_len > y->key_len ? 1 : 0;
}

static jw_err walk(json_writer *w, const json_value *v) {
  jw_err e = JW_OK;
  switch (v->type) {
    case JSON_NULL: return jw_null(w);
    case JSON_BOOL: return jw_bool(w, v->u.b);
    case JSON_INT: return jw_int(w, v->u.i);
    case JSON_DOUBLE: return jw_double(w, v->u.d);
    case JSON_STRING: return jw_string(w, v->u.str.s, v->u.str.len);
    case JSON_ARRAY:
      e = jw_begin_array(w);
      for (size_t i = 0; i < v->u.arr.count && !e; i++) e = walk(w, v->u.arr.items[i]);
      return e ? e : jw_end(w, ']');
    case JSON_OBJECT: {
      size_t n = v->u.obj.count;
      const json_member **order = NULL;
      if (w->opts.sort_keys && n) {
        order = malloc(n * sizeof *order);
        if (!order) return set_err(w, JW_ERR_NOMEM);
        for (size_t i = 0; i < n; i++) order[i] = &v->u.obj.members[i];
        qsort(order, n, sizeof *order, cmp_member);
      }
      e = jw_begin_object(w);
      for (size_t i = 0; i < n && !e; i++) {
        const json_member *m = order ? order[i] : &v->u.obj.members[i];
        e = jw_key(w, m->key, m->key_len);
        if (!e) e = walk(w, m->value);
      }
      free(order);
      return e ? e : jw_end(w, '}');
    }
  }
  return set_err(w, JW_ERR_STATE);
}

/** @id CODE-WRITE-004 @implements REQ-WRITE-001 REQ-WRITE-002 REQ-WRITE-007 REQ-WRITE-009 REQ-WRITE-010 */
jw_err json_write(const json_value *v, const jw_opts *opts, jw_sink sink, void *ctx) {
  json_writer *w = jw_new(opts, sink, ctx);
  if (!w) return JW_ERR_NOMEM;
  jw_err e = walk(w, v);
  if (!e) e = jw_finish(w);
  jw_free(w);
  return e;
}

typedef struct { char *buf; size_t cap, len; } bufsink;

static int buf_sink(void *ctx, const char *d, size_t n) {
  bufsink *b = ctx;
  if (b->cap && b->len < b->cap - 1) {
    size_t room = b->cap - 1 - b->len;
    memcpy(b->buf + b->len, d, n < room ? n : room);
  }
  b->len += n;
  return 0;
}

/** @id CODE-WRITE-005 @implements REQ-WRITE-006 */
jw_err json_write_buf(const json_value *v, const jw_opts *opts, char *buf, size_t cap, size_t *needed) {
  bufsink b = {buf, cap, 0};
  jw_err e = json_write(v, opts, buf_sink, &b);
  if (cap) buf[b.len < cap - 1 ? b.len : cap - 1] = '\0';
  if (needed) *needed = b.len;
  return e;
}
