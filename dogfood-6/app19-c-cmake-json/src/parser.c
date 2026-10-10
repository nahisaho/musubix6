#include "json.h"
#include <errno.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef enum {
  S_TOP_VALUE, S_TOP_DONE, S_ARR_FIRST, S_ARR_VALUE, S_ARR_NEXT,
  S_OBJ_FIRST, S_OBJ_COLON, S_OBJ_VALUE, S_OBJ_NEXT, S_OBJ_KEY
} pstate;

typedef struct {
  json_value *value;
  pstate st;
  json_value **items;
  json_member *members;
  size_t *idx;
  size_t count, cap;
  size_t cur;       /* member receiving the pending value */
  const char *key;  /* pending key (arena memory) */
  size_t key_len;
} frame;

struct json_parser {
  arena_t *arena;
  arena_mark_t mark;
  json_opts opts;
  json_lexer *lx;
  frame *frames;
  size_t depth, frame_cap;
  pstate top;           /* state when no frame is open */
  json_value *root;
  json_error err;
  int failed, done;
  json_token cur_tok;   /* token being consumed, for error positions */
};

const char *json_err_name(json_err e) {
  static const char *n[] = {"OK", "ERR_LEX", "ERR_SYNTAX", "ERR_DEPTH", "ERR_DUPKEY", "ERR_TRAILING", "ERR_EMPTY", "ERR_RANGE", "ERR_NOMEM", "ERR_STATE"};
  return (unsigned)e < sizeof n / sizeof n[0] ? n[e] : "?";
}

static int key_cmp(const char *a, size_t al, const char *b, size_t bl) {
  size_t m = al < bl ? al : bl;
  int c = m ? memcmp(a, b, m) : 0;
  if (c) return c;
  return al < bl ? -1 : al > bl ? 1 : 0;
}

/** @id CODE-PARSE-001 @implements REQ-PARSE-008 */
static void append_pointer(char *path, size_t *n, const char *s, size_t len) {
  for (size_t i = 0; i < len; i++) {
    const char *rep = s[i] == '~' ? "~0" : s[i] == '/' ? "~1" : NULL;
    size_t k = rep ? 2 : 1;
    if (*n + k > 255) { *n = 256; return; }
    if (rep) { memcpy(path + *n, rep, 2); } else path[*n] = s[i];
    *n += k;
  }
}

static void add_component(char *path, size_t *n, const frame *f, int is_slot_of_top) {
  (void)is_slot_of_top;
  if (*n >= 255) return;
  path[(*n)++] = '/';
  if (f->value->type == JSON_ARRAY) {
    char num[32];
    int k = snprintf(num, sizeof num, "%zu", f->count);
    append_pointer(path, n, num, (size_t)k);
  } else append_pointer(path, n, f->key, f->key_len);
}

static void build_path(const json_parser *p, char *path) {
  size_t n = 0;
  for (size_t i = 0; i < p->depth; i++) {
    const frame *f = &p->frames[i];
    int top = i + 1 == p->depth;
    if (!top) { add_component(path, &n, f, 0); continue; }
    if (f->value->type == JSON_ARRAY) add_component(path, &n, f, 1);
    else if (f->st == S_OBJ_COLON || f->st == S_OBJ_VALUE) add_component(path, &n, f, 1);
  }
  if (n > 255) n = 255;
  path[n] = '\0';
}

static void free_frames(json_parser *p) {
  for (size_t i = 0; i < p->depth; i++) { free(p->frames[i].items); free(p->frames[i].members); free(p->frames[i].idx); }
  p->depth = 0;
}

static json_err fail(json_parser *p, json_err code, lex_err lex, const char *msg, size_t line, size_t col, size_t off) {
  if (p->failed) return p->err.code;
  memset(&p->err, 0, sizeof p->err);
  p->err.code = code; p->err.lex = lex; p->err.line = line; p->err.col = col; p->err.offset = off;
  snprintf(p->err.msg, sizeof p->err.msg, "%s", msg);
  build_path(p, p->err.path);
  free_frames(p);
  arena_rewind(p->arena, p->mark);
  p->root = NULL;
  p->failed = 1;
  return code;
}

static json_err fail_tok(json_parser *p, json_err code, const char *msg) {
  return fail(p, code, LEX_OK, msg, p->cur_tok.line, p->cur_tok.col, p->cur_tok.offset);
}

static const char *lex_msg(lex_err e) {
  switch (e) {
    case LEX_ERR_CHAR: return "unexpected character";
    case LEX_ERR_CTRL: return "control character in string";
    case LEX_ERR_ESCAPE: return "bad escape";
    case LEX_ERR_SURROGATE: return "bad surrogate pair";
    case LEX_ERR_UTF8: return "invalid UTF-8";
    case LEX_ERR_NUMBER: return "malformed number";
    case LEX_ERR_LITERAL: return "bad literal";
    case LEX_ERR_EOF: return "unexpected end of input";
    case LEX_ERR_TOOLONG: return "token too long";
    default: return "lexer error";
  }
}

static json_value *new_value(json_parser *p, json_type t) {
  json_value *v = arena_alloc(p->arena, sizeof *v, sizeof(void *));
  if (!v) return NULL;
  v->type = t; v->line = p->cur_tok.line; v->col = p->cur_tok.col; v->offset = p->cur_tok.offset;
  return v;
}

/** @id CODE-PARSE-002 @implements REQ-PARSE-006 */
static json_err make_number(json_parser *p, const json_token *t, json_value **out) {
  char small[64], *buf = small;
  if (t->len >= sizeof small) { buf = malloc(t->len + 1); if (!buf) return fail_tok(p, JSON_ERR_NOMEM, "out of memory"); }
  memcpy(buf, t->text, t->len); buf[t->len] = '\0';
  json_value *v = new_value(p, JSON_DOUBLE);
  json_err e = JSON_OK;
  if (!v) e = fail_tok(p, JSON_ERR_NOMEM, "out of memory");
  else {
    int as_int = 0;
    if (t->is_int && strcmp(buf, "-0") != 0) {
      int neg = buf[0] == '-';
      uint64_t acc = 0; int ovf = 0;
      for (const char *c = buf + neg; *c; c++) {
        unsigned d = (unsigned)(*c - '0');
        if (acc > (UINT64_MAX - d) / 10) { ovf = 1; break; }
        acc = acc * 10 + d;
      }
      if (!ovf && (neg ? acc <= (uint64_t)INT64_MAX + 1 : acc <= (uint64_t)INT64_MAX)) {
        v->type = JSON_INT; v->u.i = neg ? (int64_t)(0 - acc) : (int64_t)acc; as_int = 1;
      }
    }
    if (!as_int) {
      errno = 0;
      double d = strtod(buf, NULL);
      if (isinf(d)) e = fail_tok(p, JSON_ERR_RANGE, "number out of range");
      else v->u.d = d;
    }
  }
  if (buf != small) free(buf);
  *out = v;
  return e;
}

static json_err complete(json_parser *p, json_value *v) {
  if (!p->depth) { p->root = v; p->top = S_TOP_DONE; return JSON_OK; }
  frame *f = &p->frames[p->depth - 1];
  if (v->type == JSON_NULL + 100) return JSON_OK;
  if (f->value->type == JSON_ARRAY) {
    if (f->count == f->cap) {
      size_t nc = f->cap ? f->cap * 2 : 8;
      json_value **ni = realloc(f->items, nc * sizeof *ni);
      if (!ni) return fail_tok(p, JSON_ERR_NOMEM, "out of memory");
      f->items = ni; f->cap = nc;
    }
    f->items[f->count++] = v;
    f->st = S_ARR_NEXT;
  } else {
    f->members[f->cur].value = v;
    f->st = S_OBJ_NEXT;
  }
  return JSON_OK;
}

static json_err open_container(json_parser *p, int is_obj) {
  size_t maxd = p->opts.max_depth ? p->opts.max_depth : 64;
  if (p->depth >= maxd) return fail_tok(p, JSON_ERR_DEPTH, "nesting too deep");
  json_value *v = new_value(p, is_obj ? JSON_OBJECT : JSON_ARRAY);
  if (!v) return fail_tok(p, JSON_ERR_NOMEM, "out of memory");
  if (p->depth == p->frame_cap) {
    size_t nc = p->frame_cap ? p->frame_cap * 2 : 8;
    frame *nf = realloc(p->frames, nc * sizeof *nf);
    if (!nf) return fail_tok(p, JSON_ERR_NOMEM, "out of memory");
    p->frames = nf; p->frame_cap = nc;
  }
  frame *f = &p->frames[p->depth++];
  memset(f, 0, sizeof *f);
  f->value = v;
  f->st = is_obj ? S_OBJ_FIRST : S_ARR_FIRST;
  return JSON_OK;
}

static json_err close_container(json_parser *p) {
  frame *f = &p->frames[p->depth - 1];
  json_value *v = f->value;
  if (v->type == JSON_ARRAY) {
    v->u.arr.count = f->count;
    if (f->count) {
      v->u.arr.items = arena_alloc(p->arena, f->count * sizeof(json_value *), sizeof(void *));
      if (!v->u.arr.items) return fail_tok(p, JSON_ERR_NOMEM, "out of memory");
      memcpy(v->u.arr.items, f->items, f->count * sizeof(json_value *));
    }
  } else {
    v->u.obj.count = f->count;
    if (f->count) {
      v->u.obj.members = arena_alloc(p->arena, f->count * sizeof(json_member), sizeof(void *));
      if (!v->u.obj.members) return fail_tok(p, JSON_ERR_NOMEM, "out of memory");
      memcpy(v->u.obj.members, f->members, f->count * sizeof(json_member));
      if (f->count > 8) {
        v->u.obj.index = arena_alloc(p->arena, f->count * sizeof(size_t), sizeof(size_t));
        if (!v->u.obj.index) return fail_tok(p, JSON_ERR_NOMEM, "out of memory");
        memcpy(v->u.obj.index, f->idx, f->count * sizeof(size_t));
      }
    }
  }
  free(f->items); free(f->members); free(f->idx);
  p->depth--;
  return complete(p, v);
}

/** @id CODE-PARSE-003 @implements REQ-PARSE-002 */
static json_err add_key(json_parser *p, frame *f, const json_token *t) {
  const char *key = arena_strndup(p->arena, t->text, t->len);
  if (!key) return fail_tok(p, JSON_ERR_NOMEM, "out of memory");
  size_t lo = 0, hi = f->count;
  while (lo < hi) {
    size_t mid = (lo + hi) / 2;
    json_member *m = &f->members[f->idx[mid]];
    int c = key_cmp(m->key, m->key_len, t->text, t->len);
    if (c < 0) lo = mid + 1; else hi = mid;
  }
  f->key = key; f->key_len = t->len;
  f->st = S_OBJ_COLON;
  if (lo < f->count) {
    json_member *m = &f->members[f->idx[lo]];
    if (key_cmp(m->key, m->key_len, t->text, t->len) == 0) {
      if (p->opts.dup != JSON_DUP_LAST) return fail_tok(p, JSON_ERR_DUPKEY, "duplicate key");
      f->cur = f->idx[lo];
      return JSON_OK;
    }
  }
  if (f->count == f->cap) {
    size_t nc = f->cap ? f->cap * 2 : 8;
    json_member *nm = realloc(f->members, nc * sizeof *nm);
    if (nm) f->members = nm;
    size_t *ni = realloc(f->idx, nc * sizeof *ni);
    if (ni) f->idx = ni;
    if (!nm || !ni) return fail_tok(p, JSON_ERR_NOMEM, "out of memory");
    f->cap = nc;
  }
  memmove(f->idx + lo + 1, f->idx + lo, (f->count - lo) * sizeof *f->idx);
  f->idx[lo] = f->count;
  f->members[f->count].key = key; f->members[f->count].key_len = t->len; f->members[f->count].value = NULL;
  f->cur = f->count++;
  return JSON_OK;
}

static int is_value_start(tok_type t) {
  return t == TOK_STRING || t == TOK_NUMBER || t == TOK_TRUE || t == TOK_FALSE || t == TOK_NULL || t == TOK_LBRACE || t == TOK_LBRACKET;
}

static json_err scalar_or_open(json_parser *p, const json_token *t) {
  json_value *v;
  switch (t->type) {
    case TOK_LBRACE: return open_container(p, 1);
    case TOK_LBRACKET: return open_container(p, 0);
    case TOK_NUMBER: { json_err e = make_number(p, t, &v); if (e) return e; break; }
    case TOK_STRING: {
      v = new_value(p, JSON_STRING);
      if (!v) return fail_tok(p, JSON_ERR_NOMEM, "out of memory");
      v->u.str.s = arena_strndup(p->arena, t->text, t->len);
      if (!v->u.str.s) return fail_tok(p, JSON_ERR_NOMEM, "out of memory");
      v->u.str.len = t->len;
      break;
    }
    default:
      v = new_value(p, t->type == TOK_NULL ? JSON_NULL : JSON_BOOL);
      if (!v) return fail_tok(p, JSON_ERR_NOMEM, "out of memory");
      v->u.b = t->type == TOK_TRUE;
  }
  return complete(p, v);
}

/** @id CODE-PARSE-004 @implements REQ-PARSE-001 REQ-PARSE-003 REQ-PARSE-004 REQ-PARSE-005 REQ-PARSE-012 */
static int consume(void *ctx, const json_token *t) {
  json_parser *p = ctx;
  p->cur_tok = *t;
  if (p->failed) return 1;
  if (!p->depth) {
    if (p->top == S_TOP_DONE) {
      if (t->type == TOK_EOF) { p->done = 1; return 0; }
      fail_tok(p, JSON_ERR_TRAILING, "unexpected content after document");
      return 1;
    }
    if (t->type == TOK_EOF) { fail_tok(p, JSON_ERR_EMPTY, "empty document"); return 1; }
    if (!is_value_start(t->type)) { fail_tok(p, JSON_ERR_SYNTAX, "expected value"); return 1; }
    return scalar_or_open(p, t) != JSON_OK;
  }
  frame *f = &p->frames[p->depth - 1];
  if (t->type == TOK_EOF) { fail_tok(p, JSON_ERR_SYNTAX, "unexpected end of input"); return 1; }
  switch (f->st) {
    case S_ARR_FIRST:
      if (t->type == TOK_RBRACKET) return close_container(p) != JSON_OK;
      if (is_value_start(t->type)) return scalar_or_open(p, t) != JSON_OK;
      fail_tok(p, JSON_ERR_SYNTAX, "expected value or ']'"); return 1;
    case S_ARR_VALUE:
      if (is_value_start(t->type)) return scalar_or_open(p, t) != JSON_OK;
      fail_tok(p, JSON_ERR_SYNTAX, "expected value"); return 1;
    case S_ARR_NEXT:
      if (t->type == TOK_COMMA) { f->st = S_ARR_VALUE; return 0; }
      if (t->type == TOK_RBRACKET) return close_container(p) != JSON_OK;
      fail_tok(p, JSON_ERR_SYNTAX, "expected ',' or ']'"); return 1;
    case S_OBJ_FIRST:
      if (t->type == TOK_RBRACE) return close_container(p) != JSON_OK;
      if (t->type == TOK_STRING) return add_key(p, f, t) != JSON_OK;
      fail_tok(p, JSON_ERR_SYNTAX, "expected string key or '}'"); return 1;
    case S_OBJ_KEY:
      if (t->type == TOK_STRING) return add_key(p, f, t) != JSON_OK;
      fail_tok(p, JSON_ERR_SYNTAX, "expected string key"); return 1;
    case S_OBJ_COLON:
      if (t->type == TOK_COLON) { f->st = S_OBJ_VALUE; return 0; }
      fail_tok(p, JSON_ERR_SYNTAX, "expected ':'"); return 1;
    case S_OBJ_VALUE:
      if (is_value_start(t->type)) return scalar_or_open(p, t) != JSON_OK;
      fail_tok(p, JSON_ERR_SYNTAX, "expected value"); return 1;
    case S_OBJ_NEXT:
      if (t->type == TOK_COMMA) { f->st = S_OBJ_KEY; return 0; }
      if (t->type == TOK_RBRACE) return close_container(p) != JSON_OK;
      fail_tok(p, JSON_ERR_SYNTAX, "expected ',' or '}'"); return 1;
    default: break;
  }
  fail_tok(p, JSON_ERR_SYNTAX, "unexpected token");
  return 1;
}

json_parser *jp_new(arena_t *arena, const json_opts *opts) {
  json_parser *p = calloc(1, sizeof *p);
  if (!p) return NULL;
  p->arena = arena;
  if (opts) p->opts = *opts;
  p->lx = lex_new(consume, p, p->opts.max_token);
  if (!p->lx) { free(p); return NULL; }
  p->mark = arena_mark(arena);
  p->top = S_TOP_VALUE;
  return p;
}

void jp_free(json_parser *p) {
  if (!p) return;
  free_frames(p);
  free(p->frames);
  lex_free(p->lx);
  free(p);
}

static json_err lex_failure(json_parser *p, lex_err le) {
  if (p->failed) return p->err.code;
  lex_error x = lex_get_error(p->lx);
  return fail(p, JSON_ERR_LEX, le, lex_msg(le), x.line, x.col, x.offset);
}

json_err jp_feed(json_parser *p, const char *data, size_t len) {
  if (p->failed) return p->err.code;
  if (p->done) return JSON_ERR_STATE;
  lex_err le = lex_feed(p->lx, data, len);
  return le ? lex_failure(p, le) : JSON_OK;
}

json_err jp_finish(json_parser *p, json_value **out) {
  if (out) *out = NULL;
  if (p->failed) return p->err.code;
  if (p->done) return JSON_ERR_STATE;
  lex_err le = lex_finish(p->lx);
  if (le) return lex_failure(p, le);
  if (out) *out = p->root;
  return JSON_OK;
}

json_error jp_error(const json_parser *p) { return p->err; }

json_err json_parse(arena_t *arena, const char *data, size_t len, const json_opts *opts, json_value **out, json_error *err) {
  if (out) *out = NULL;
  json_parser *p = jp_new(arena, opts);
  if (!p) return JSON_ERR_NOMEM;
  json_err e = jp_feed(p, data, len);
  if (e == JSON_OK) e = jp_finish(p, out);
  if (err) *err = jp_error(p);
  jp_free(p);
  return e;
}

static const json_member *obj_find(const json_value *obj, const char *key, size_t len) {
  if (!obj || obj->type != JSON_OBJECT) return NULL;
  const json_member *ms = obj->u.obj.members;
  if (obj->u.obj.index) {
    size_t lo = 0, hi = obj->u.obj.count;
    while (lo < hi) {
      size_t mid = (lo + hi) / 2;
      const json_member *m = &ms[obj->u.obj.index[mid]];
      int c = key_cmp(m->key, m->key_len, key, len);
      if (c == 0) return m;
      if (c < 0) lo = mid + 1; else hi = mid;
    }
    return NULL;
  }
  for (size_t i = 0; i < obj->u.obj.count; i++)
    if (key_cmp(ms[i].key, ms[i].key_len, key, len) == 0) return &ms[i];
  return NULL;
}

/** @id CODE-PARSE-005 @implements REQ-PARSE-010 */
const json_value *json_obj_get(const json_value *obj, const char *key) {
  const json_member *m = obj_find(obj, key, strlen(key));
  return m ? m->value : NULL;
}

static int int_equals_double(int64_t i, double d) {
  return d >= -9223372036854775808.0 && d < 9223372036854775808.0 && d == floor(d) && (int64_t)d == i;
}

/** @id CODE-PARSE-006 @implements REQ-PARSE-011 */
int json_equal(const json_value *a, const json_value *b) {
  if (a == b) return 1;
  if (!a || !b) return 0;
  int an = a->type == JSON_INT || a->type == JSON_DOUBLE, bn = b->type == JSON_INT || b->type == JSON_DOUBLE;
  if (an && bn) {
    if (a->type == b->type) return a->type == JSON_INT ? a->u.i == b->u.i : a->u.d == b->u.d;
    return a->type == JSON_INT ? int_equals_double(a->u.i, b->u.d) : int_equals_double(b->u.i, a->u.d);
  }
  if (a->type != b->type) return 0;
  switch (a->type) {
    case JSON_NULL: return 1;
    case JSON_BOOL: return !a->u.b == !b->u.b;
    case JSON_STRING: return a->u.str.len == b->u.str.len && memcmp(a->u.str.s, b->u.str.s, a->u.str.len) == 0;
    case JSON_ARRAY:
      if (a->u.arr.count != b->u.arr.count) return 0;
      for (size_t i = 0; i < a->u.arr.count; i++) if (!json_equal(a->u.arr.items[i], b->u.arr.items[i])) return 0;
      return 1;
    case JSON_OBJECT:
      if (a->u.obj.count != b->u.obj.count) return 0;
      for (size_t i = 0; i < a->u.obj.count; i++) {
        const json_member *m = obj_find(b, a->u.obj.members[i].key, a->u.obj.members[i].key_len);
        if (!m || !json_equal(a->u.obj.members[i].value, m->value)) return 0;
      }
      return 1;
    default: return 0;
  }
}
