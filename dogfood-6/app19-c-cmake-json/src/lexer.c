#include "lexer.h"
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef enum {
  ST_VALUE, ST_STR, ST_ESC, ST_U, ST_SURR_BS, ST_SURR_U, ST_UTF8,
  ST_NUM_MINUS, ST_NUM_ZERO, ST_NUM_INT, ST_FRAC0, ST_FRAC, ST_EXP0, ST_EXPSIGN, ST_EXP,
  ST_LIT, ST_DONE
} lex_state;

struct json_lexer {
  lex_cb cb; void *ctx; size_t max_token;
  lex_state st;
  char *buf; size_t len, cap;
  size_t offset, line, col;          /* cursor: next byte */
  size_t tok_offset, tok_line, tok_col;
  size_t err_offset, err_line, err_col;
  lex_err err;
  unsigned hex_val, hex_n;           /* \u accumulation */
  unsigned high;                     /* pending high surrogate, 0 if none */
  int is_int;
  const char *lit; size_t lit_pos; tok_type lit_tok;
  int utf8_left; unsigned char utf8_lo, utf8_hi;
};

const char *tok_name(tok_type t) {
  static const char *n[] = {"{", "}", "[", "]", ":", ",", "true", "false", "null", "STRING", "NUMBER", "EOF"};
  return (unsigned)t < sizeof n / sizeof n[0] ? n[t] : "?";
}

const char *lex_err_name(lex_err e) {
  static const char *n[] = {"OK", "ERR_CHAR", "ERR_CTRL", "ERR_ESCAPE", "ERR_SURROGATE", "ERR_UTF8", "ERR_NUMBER",
                            "ERR_LITERAL", "ERR_EOF", "ERR_TOOLONG", "ERR_CALLBACK", "ERR_STATE", "ERR_NOMEM"};
  return (unsigned)e < sizeof n / sizeof n[0] ? n[e] : "?";
}

/** @id CODE-LEX-001 @implements REQ-LEX-001 */
json_lexer *lex_new(lex_cb cb, void *ctx, size_t max_token) {
  json_lexer *lx = calloc(1, sizeof *lx);
  if (!lx) return NULL;
  lx->cb = cb; lx->ctx = ctx; lx->max_token = max_token;
  lx->line = lx->col = 1;
  return lx;
}

void lex_free(json_lexer *lx) { if (lx) { free(lx->buf); free(lx); } }

lex_error lex_get_error(const json_lexer *lx) {
  lex_error e = {lx->err, lx->err_offset, lx->err_line, lx->err_col};
  return e;
}

static lex_err fail(json_lexer *lx, lex_err code, int at_token_cursor) {
  (void)at_token_cursor;
  lx->err = code; lx->err_offset = lx->offset; lx->err_line = lx->line; lx->err_col = lx->col;
  return code;
}

/** @id CODE-LEX-002 @implements REQ-LEX-010 */
static int push(json_lexer *lx, const char *s, size_t n) {
  if (lx->max_token && lx->len + n > lx->max_token) return -2;
  if (lx->len + n > lx->cap) {
    size_t nc = lx->cap ? lx->cap * 2 : 64;
    while (nc < lx->len + n) nc *= 2;
    char *nb = realloc(lx->buf, nc);
    if (!nb) return -1;
    lx->buf = nb; lx->cap = nc;
  }
  memcpy(lx->buf + lx->len, s, n);
  lx->len += n;
  return 0;
}

static lex_err push_or_fail(json_lexer *lx, const char *s, size_t n) {
  int r = push(lx, s, n);
  if (r == -2) return fail(lx, LEX_ERR_TOOLONG, 0);
  if (r) return fail(lx, LEX_ERR_NOMEM, 0);
  return LEX_OK;
}

static lex_err emit(json_lexer *lx, tok_type type, const char *text, size_t len, int is_int) {
  if (!lx->cb) return LEX_OK;
  json_token t = {type, text, len, is_int, lx->tok_offset, lx->tok_line, lx->tok_col};
  if (lx->cb(lx->ctx, &t)) return fail(lx, LEX_ERR_CALLBACK, 0);
  return LEX_OK;
}

static void begin_tok(json_lexer *lx) {
  lx->tok_offset = lx->offset; lx->tok_line = lx->line; lx->tok_col = lx->col;
  lx->len = 0;
}

static size_t utf8_encode(unsigned cp, char out[4]) {
  if (cp < 0x80) { out[0] = (char)cp; return 1; }
  if (cp < 0x800) { out[0] = (char)(0xC0 | cp >> 6); out[1] = (char)(0x80 | (cp & 0x3F)); return 2; }
  if (cp < 0x10000) { out[0] = (char)(0xE0 | cp >> 12); out[1] = (char)(0x80 | ((cp >> 6) & 0x3F)); out[2] = (char)(0x80 | (cp & 0x3F)); return 3; }
  out[0] = (char)(0xF0 | cp >> 18); out[1] = (char)(0x80 | ((cp >> 12) & 0x3F));
  out[2] = (char)(0x80 | ((cp >> 6) & 0x3F)); out[3] = (char)(0x80 | (cp & 0x3F));
  return 4;
}

static int hexval(unsigned char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

static int is_delim_blocker(unsigned char c) { return (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_'; }

static lex_err finish_number(json_lexer *lx) {
  lex_err e = emit(lx, TOK_NUMBER, lx->buf, lx->len, lx->is_int);
  lx->st = ST_VALUE;
  return e;
}

static lex_err step(json_lexer *lx, unsigned char c);

/** @id CODE-LEX-003 @implements REQ-LEX-002 REQ-LEX-003 REQ-LEX-004 REQ-LEX-005 REQ-LEX-006 REQ-LEX-007 REQ-LEX-009 */
static lex_err step(json_lexer *lx, unsigned char c) {
  lex_err e;
  switch (lx->st) {
  case ST_VALUE:
    switch (c) {
    case ' ': case '\t': case '\n': case '\r': return LEX_OK;
    case '{': begin_tok(lx); return emit(lx, TOK_LBRACE, NULL, 0, 0);
    case '}': begin_tok(lx); return emit(lx, TOK_RBRACE, NULL, 0, 0);
    case '[': begin_tok(lx); return emit(lx, TOK_LBRACKET, NULL, 0, 0);
    case ']': begin_tok(lx); return emit(lx, TOK_RBRACKET, NULL, 0, 0);
    case ':': begin_tok(lx); return emit(lx, TOK_COLON, NULL, 0, 0);
    case ',': begin_tok(lx); return emit(lx, TOK_COMMA, NULL, 0, 0);
    case '"': begin_tok(lx); lx->st = ST_STR; lx->high = 0; return LEX_OK;
    case '-': begin_tok(lx); lx->is_int = 1; lx->st = ST_NUM_MINUS; return push_or_fail(lx, "-", 1);
    case '0': begin_tok(lx); lx->is_int = 1; lx->st = ST_NUM_ZERO; return push_or_fail(lx, "0", 1);
    case 't': begin_tok(lx); lx->st = ST_LIT; lx->lit = "true"; lx->lit_tok = TOK_TRUE; lx->lit_pos = 1; return LEX_OK;
    case 'f': begin_tok(lx); lx->st = ST_LIT; lx->lit = "false"; lx->lit_tok = TOK_FALSE; lx->lit_pos = 1; return LEX_OK;
    case 'n': begin_tok(lx); lx->st = ST_LIT; lx->lit = "null"; lx->lit_tok = TOK_NULL; lx->lit_pos = 1; return LEX_OK;
    default:
      if (c >= '1' && c <= '9') { begin_tok(lx); lx->is_int = 1; lx->st = ST_NUM_INT; char ch = (char)c; return push_or_fail(lx, &ch, 1); }
      return fail(lx, LEX_ERR_CHAR, 0);
    }
  case ST_LIT:
    if (lx->lit[lx->lit_pos] == '\0') {
      if (is_delim_blocker(c)) return fail(lx, LEX_ERR_LITERAL, 0);
      e = emit(lx, lx->lit_tok, NULL, 0, 0); lx->st = ST_VALUE;
      return e ? e : step(lx, c);
    }
    if (c != (unsigned char)lx->lit[lx->lit_pos]) return fail(lx, LEX_ERR_LITERAL, 0);
    lx->lit_pos++;
    return LEX_OK;
  case ST_STR:
    if (c == '"') { e = emit(lx, TOK_STRING, lx->buf ? lx->buf : "", lx->len, 0); lx->st = ST_VALUE; return e; }
    if (c == '\\') { lx->st = ST_ESC; return LEX_OK; }
    if (c < 0x20) return fail(lx, LEX_ERR_CTRL, 0);
    if (c < 0x80) { char ch = (char)c; return push_or_fail(lx, &ch, 1); }
    if (c >= 0xC2 && c <= 0xDF) { lx->utf8_left = 1; lx->utf8_lo = 0x80; lx->utf8_hi = 0xBF; }
    else if (c >= 0xE0 && c <= 0xEF) {
      lx->utf8_left = 2; lx->utf8_lo = c == 0xE0 ? 0xA0 : 0x80; lx->utf8_hi = c == 0xED ? 0x9F : 0xBF;
    } else if (c >= 0xF0 && c <= 0xF4) {
      lx->utf8_left = 3; lx->utf8_lo = c == 0xF0 ? 0x90 : 0x80; lx->utf8_hi = c == 0xF4 ? 0x8F : 0xBF;
    } else return fail(lx, LEX_ERR_UTF8, 0);
    lx->st = ST_UTF8;
    { char ch = (char)c; return push_or_fail(lx, &ch, 1); }
  case ST_UTF8:
    if (c < lx->utf8_lo || c > lx->utf8_hi) return fail(lx, LEX_ERR_UTF8, 0);
    lx->utf8_lo = 0x80; lx->utf8_hi = 0xBF;
    if (--lx->utf8_left == 0) lx->st = ST_STR;
    { char ch = (char)c; return push_or_fail(lx, &ch, 1); }
  case ST_ESC: {
    char o = 0;
    switch (c) {
    case '"': o = '"'; break; case '\\': o = '\\'; break; case '/': o = '/'; break;
    case 'b': o = '\b'; break; case 'f': o = '\f'; break; case 'n': o = '\n'; break;
    case 'r': o = '\r'; break; case 't': o = '\t'; break;
    case 'u': lx->st = ST_U; lx->hex_val = 0; lx->hex_n = 0; return LEX_OK;
    default: return fail(lx, LEX_ERR_ESCAPE, 0);
    }
    lx->st = ST_STR;
    return push_or_fail(lx, &o, 1);
  }
  case ST_SURR_BS:
    if (c != '\\') return fail(lx, LEX_ERR_SURROGATE, 0);
    lx->st = ST_SURR_U; return LEX_OK;
  case ST_SURR_U:
    if (c != 'u') return fail(lx, LEX_ERR_SURROGATE, 0);
    lx->st = ST_U; lx->hex_val = 0; lx->hex_n = 0; return LEX_OK;
  case ST_U: {
    int h = hexval(c);
    if (h < 0) return fail(lx, LEX_ERR_ESCAPE, 0);
    lx->hex_val = lx->hex_val << 4 | (unsigned)h;
    if (++lx->hex_n < 4) return LEX_OK;
    unsigned v = lx->hex_val, cp;
    if (lx->high) {
      if (v < 0xDC00 || v > 0xDFFF) return fail(lx, LEX_ERR_SURROGATE, 0);
      cp = 0x10000 + ((lx->high - 0xD800) << 10) + (v - 0xDC00);
      lx->high = 0;
    } else if (v >= 0xD800 && v <= 0xDBFF) {
      lx->high = v; lx->st = ST_SURR_BS; return LEX_OK;
    } else if (v >= 0xDC00 && v <= 0xDFFF) {
      return fail(lx, LEX_ERR_SURROGATE, 0);
    } else cp = v;
    char out[4];
    size_t n = utf8_encode(cp, out);
    lx->st = ST_STR;
    return push_or_fail(lx, out, n);
  }
  case ST_NUM_MINUS:
    if (c == '0') { lx->st = ST_NUM_ZERO; return push_or_fail(lx, "0", 1); }
    if (c >= '1' && c <= '9') { lx->st = ST_NUM_INT; char ch = (char)c; return push_or_fail(lx, &ch, 1); }
    return fail(lx, LEX_ERR_NUMBER, 0);
  case ST_NUM_ZERO:
  case ST_NUM_INT:
    if (c >= '0' && c <= '9') {
      if (lx->st == ST_NUM_ZERO) return fail(lx, LEX_ERR_NUMBER, 0);
      char ch = (char)c; return push_or_fail(lx, &ch, 1);
    }
    if (c == '.') { lx->is_int = 0; lx->st = ST_FRAC0; return push_or_fail(lx, ".", 1); }
    if (c == 'e' || c == 'E') { lx->is_int = 0; lx->st = ST_EXP0; char ch = (char)c; return push_or_fail(lx, &ch, 1); }
    e = finish_number(lx);
    return e ? e : step(lx, c);
  case ST_FRAC0:
    if (c < '0' || c > '9') return fail(lx, LEX_ERR_NUMBER, 0);
    lx->st = ST_FRAC; { char ch = (char)c; return push_or_fail(lx, &ch, 1); }
  case ST_FRAC:
    if (c >= '0' && c <= '9') { char ch = (char)c; return push_or_fail(lx, &ch, 1); }
    if (c == 'e' || c == 'E') { lx->st = ST_EXP0; char ch = (char)c; return push_or_fail(lx, &ch, 1); }
    e = finish_number(lx);
    return e ? e : step(lx, c);
  case ST_EXP0:
    if (c == '+' || c == '-') { lx->st = ST_EXPSIGN; char ch = (char)c; return push_or_fail(lx, &ch, 1); }
    /* fallthrough */
  case ST_EXPSIGN:
    if (c < '0' || c > '9') return fail(lx, LEX_ERR_NUMBER, 0);
    lx->st = ST_EXP; { char ch = (char)c; return push_or_fail(lx, &ch, 1); }
  case ST_EXP:
    if (c >= '0' && c <= '9') { char ch = (char)c; return push_or_fail(lx, &ch, 1); }
    e = finish_number(lx);
    return e ? e : step(lx, c);
  case ST_DONE: return LEX_ERR_STATE;
  }
  return LEX_ERR_STATE;
}

/** @id CODE-LEX-004 @implements REQ-LEX-008 */
lex_err lex_feed(json_lexer *lx, const char *data, size_t len) {
  if (lx->err) return lx->err;
  if (lx->st == ST_DONE) return LEX_ERR_STATE;
  for (size_t i = 0; i < len; i++) {
    unsigned char c = (unsigned char)data[i];
    lex_err e = step(lx, c);
    if (e) return e;
    lx->offset++;
    if (c == '\n') { lx->line++; lx->col = 1; } else lx->col++;
  }
  return LEX_OK;
}

lex_err lex_finish(json_lexer *lx) {
  if (lx->err) return lx->err;
  if (lx->st == ST_DONE) return LEX_ERR_STATE;
  switch (lx->st) {
  case ST_VALUE: break;
  case ST_LIT: {
    if (lx->lit[lx->lit_pos] != '\0') return fail(lx, LEX_ERR_EOF, 0);
    lex_err e = emit(lx, lx->lit_tok, NULL, 0, 0);
    if (e) return e;
    break;
  }
  case ST_NUM_ZERO: case ST_NUM_INT: case ST_FRAC: case ST_EXP: {
    lex_err e = finish_number(lx);
    if (e) return e;
    break;
  }
  default: return fail(lx, LEX_ERR_EOF, 0);
  }
  lx->tok_offset = lx->offset; lx->tok_line = lx->line; lx->tok_col = lx->col;
  lex_err e = emit(lx, TOK_EOF, NULL, 0, 0);
  lx->st = ST_DONE;
  return e;
}
