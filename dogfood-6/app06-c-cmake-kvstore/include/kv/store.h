#ifndef KV_STORE_H
#define KV_STORE_H
#include "kv/common.h"
#include "kv/protocol.h"

#define STORE_ST_OK 0
#define STORE_ST_NOTFOUND 1
#define STORE_ST_ERR 2

typedef struct store store_t;

store_t *store_new(size_t capacity, const kv_clock_t *clock);
void store_free(store_t *s);
size_t store_count(const store_t *s);
int store_set(store_t *s, const uint8_t *key, size_t klen, const uint8_t *val, size_t vlen, uint32_t ttl_ms);
/* 0 = hit (val/vlen point into the store), 1 = miss, <0 = invalid argument */
int store_get(store_t *s, const uint8_t *key, size_t klen, const uint8_t **val, size_t *vlen);
int store_del(store_t *s, const uint8_t *key, size_t klen);
/* Executes one frame; writes one response. Returns PROTO_OK, PROTO_NEED_MORE (nothing written) or a protocol error (ERR response written, consumed 0). */
int store_handle(store_t *s, const uint8_t *in, size_t len, uint8_t *out, size_t cap, size_t *out_len, size_t *consumed);
/* Executes every complete frame in order; stops at an incomplete tail (PROTO_OK) or at the first error. */
int store_feed(store_t *s, const uint8_t *in, size_t len, uint8_t *out, size_t cap, size_t *out_len, size_t *consumed);
#endif
