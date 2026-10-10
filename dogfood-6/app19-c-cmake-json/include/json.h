#ifndef JSON_H
#define JSON_H
#include <stddef.h>
#include <stdint.h>
#include "arena.h"
#include "lexer.h"

typedef enum { JSON_NULL, JSON_BOOL, JSON_INT, JSON_DOUBLE, JSON_STRING, JSON_ARRAY, JSON_OBJECT } json_type;
typedef struct json_value json_value;
typedef struct { const char *key; size_t key_len; json_value *value; } json_member;
struct json_value {
  json_type type;
  size_t line, col, offset;
  union {
    int b;
    int64_t i;
    double d;
    struct { const char *s; size_t len; } str;
    struct { json_value **items; size_t count; } arr;
    struct { json_member *members; size_t count; size_t *index; } obj; /* index: sorted member positions when count > 8 */
  } u;
};

typedef enum {
  JSON_OK = 0, JSON_ERR_LEX, JSON_ERR_SYNTAX, JSON_ERR_DEPTH, JSON_ERR_DUPKEY,
  JSON_ERR_TRAILING, JSON_ERR_EMPTY, JSON_ERR_RANGE, JSON_ERR_NOMEM, JSON_ERR_STATE
} json_err;
typedef enum { JSON_DUP_ERROR = 0, JSON_DUP_LAST = 1 } json_dup_policy;
typedef struct { size_t max_depth; json_dup_policy dup; size_t max_token; } json_opts;
typedef struct { json_err code; lex_err lex; size_t offset, line, col; char path[256]; char msg[96]; } json_error;
typedef struct json_parser json_parser;

json_parser *jp_new(arena_t *arena, const json_opts *opts);
void jp_free(json_parser *p);
json_err jp_feed(json_parser *p, const char *data, size_t len);
json_err jp_finish(json_parser *p, json_value **out);
json_error jp_error(const json_parser *p);
json_err json_parse(arena_t *arena, const char *data, size_t len, const json_opts *opts, json_value **out, json_error *err);
const char *json_err_name(json_err e);

const json_value *json_obj_get(const json_value *obj, const char *key);
int json_equal(const json_value *a, const json_value *b);
#endif
