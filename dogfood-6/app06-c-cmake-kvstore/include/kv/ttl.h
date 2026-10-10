#ifndef KV_TTL_H
#define KV_TTL_H
#include "kv/common.h"
#include "kv/hashtable.h"

int ttl_expires_at(const kv_clock_t *clock, uint64_t ttl_ms, uint64_t *out);
int ttl_is_expired(const ht_entry_t *e, uint64_t now);
int64_t ttl_remaining(const ht_entry_t *e, uint64_t now);
size_t ttl_sweep(ht_t *t, const kv_clock_t *clock, ht_remove_cb on_remove, void *ctx);
#endif
