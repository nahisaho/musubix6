#ifndef WRITER_H
#define WRITER_H
#include <stddef.h>
#include <stdint.h>
#include "json.h"

typedef enum { JW_OK = 0, JW_ERR_NONFINITE, JW_ERR_STATE, JW_ERR_SINK, JW_ERR_NOMEM } jw_err;
typedef struct { int indent; int ascii_only; int sort_keys; } jw_opts;
typedef int (*jw_sink)(void *ctx, const char *data, size_t len);
typedef struct json_writer json_writer;

jw_err json_write(const json_value *v, const jw_opts *opts, jw_sink sink, void *ctx);
jw_err json_write_buf(const json_value *v, const jw_opts *opts, char *buf, size_t cap, size_t *needed);

json_writer *jw_new(const jw_opts *opts, jw_sink sink, void *ctx);
void jw_free(json_writer *w);
jw_err jw_begin_object(json_writer *w);
jw_err jw_begin_array(json_writer *w);
jw_err jw_end(json_writer *w, char close); /* '}' or ']' */
jw_err jw_key(json_writer *w, const char *key, size_t len);
jw_err jw_null(json_writer *w);
jw_err jw_bool(json_writer *w, int b);
jw_err jw_int(json_writer *w, int64_t i);
jw_err jw_double(json_writer *w, double d);
jw_err jw_string(json_writer *w, const char *s, size_t len);
jw_err jw_finish(json_writer *w);
const char *jw_err_name(jw_err e);
#endif
