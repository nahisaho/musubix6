#ifndef LEXER_H
#define LEXER_H
#include <stddef.h>

typedef enum {
  TOK_LBRACE, TOK_RBRACE, TOK_LBRACKET, TOK_RBRACKET, TOK_COLON, TOK_COMMA,
  TOK_TRUE, TOK_FALSE, TOK_NULL, TOK_STRING, TOK_NUMBER, TOK_EOF
} tok_type;

typedef enum {
  LEX_OK = 0, LEX_ERR_CHAR, LEX_ERR_CTRL, LEX_ERR_ESCAPE, LEX_ERR_SURROGATE, LEX_ERR_UTF8,
  LEX_ERR_NUMBER, LEX_ERR_LITERAL, LEX_ERR_EOF, LEX_ERR_TOOLONG, LEX_ERR_CALLBACK, LEX_ERR_STATE, LEX_ERR_NOMEM
} lex_err;

typedef struct {
  tok_type type;
  const char *text; /* decoded string bytes or raw number text; valid only during the callback */
  size_t len;
  int is_int;
  size_t offset, line, col;
} json_token;

typedef struct { lex_err code; size_t offset, line, col; } lex_error;
typedef int (*lex_cb)(void *ctx, const json_token *tok);
typedef struct json_lexer json_lexer;

json_lexer *lex_new(lex_cb cb, void *ctx, size_t max_token);
void lex_free(json_lexer *lx);
lex_err lex_feed(json_lexer *lx, const char *data, size_t len);
lex_err lex_finish(json_lexer *lx);
lex_error lex_get_error(const json_lexer *lx);
const char *lex_err_name(lex_err e);
const char *tok_name(tok_type t);
#endif
