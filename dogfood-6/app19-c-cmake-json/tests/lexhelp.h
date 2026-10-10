#ifndef LEXHELP_H
#define LEXHELP_H
#include "harness.h"
#include "lexer.h"
#include <stdarg.h>

typedef struct { char out[4096]; size_t n; int positions; } transcript;

static void tr_add(transcript *t, const char *fmt, ...) {
  va_list ap; va_start(ap, fmt);
  t->n += (size_t)vsnprintf(t->out + t->n, sizeof t->out - t->n, fmt, ap);
  va_end(ap);
}

static int tr_cb(void *ctx, const json_token *k) {
  transcript *t = ctx;
  switch (k->type) {
    case TOK_STRING:
      tr_add(t, "S\"");
      for (size_t i = 0; i < k->len; i++) {
        unsigned char c = (unsigned char)k->text[i];
        if (c < 0x20 || c == '"' || c == '\\') tr_add(t, "\\x%02X", c); else tr_add(t, "%c", c);
      }
      tr_add(t, "\"");
      break;
    case TOK_NUMBER: tr_add(t, "%c%.*s", k->is_int ? 'I' : 'N', (int)k->len, k->text); break;
    default: tr_add(t, "%s", tok_name(k->type));
  }
  if (t->positions) tr_add(t, "@%zu:%zu+%zu", k->line, k->col, k->offset);
  if (k->type != TOK_EOF) tr_add(t, " ");
  return 0;
}

/* chunk == 0 means whole input; returns final error code, transcript ends with EOF or ERR_x@line:col+off */
static lex_err lex_run(const char *in, size_t len, size_t chunk, size_t max_token, int positions, transcript *t) {
  memset(t, 0, sizeof *t);
  t->positions = positions;
  json_lexer *lx = lex_new(tr_cb, t, max_token);
  lex_err e = LEX_OK;
  if (!lx) { tr_add(t, "NOLEX"); return LEX_ERR_NOMEM; }
  size_t step = chunk ? chunk : (len ? len : 1);
  for (size_t i = 0; i < len && e == LEX_OK; i += step) e = lex_feed(lx, in + i, i + step > len ? len - i : step);
  if (e == LEX_OK) e = lex_finish(lx);
  if (e != LEX_OK) { lex_error le = lex_get_error(lx); tr_add(t, "%s@%zu:%zu+%zu", lex_err_name(e), le.line, le.col, le.offset); }
  lex_free(lx);
  return e;
}
#endif
