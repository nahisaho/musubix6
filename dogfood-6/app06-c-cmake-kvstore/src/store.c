#include <stdlib.h>
#include "kv/lru.h"
#include "kv/ttl.h"
#include "kv/store.h"

struct store {
  lru_t *cache;
  size_t cap;
  kv_clock_t clock;
};

/** @id CODE-STORE-001 @implements REQ-STORE-001 */
store_t *store_new(size_t capacity, const kv_clock_t *clock) {
  if (capacity == 0 || !clock || !clock->now) return NULL;
  store_t *s = calloc(1, sizeof *s);
  if (!s) return NULL;
  s->cache = lru_new(capacity);
  if (!s->cache) { free(s); return NULL; }
  s->cap = capacity;
  s->clock = *clock;
  return s;
}

void store_free(store_t *s) {
  if (!s) return;
  lru_free(s->cache);
  free(s);
}

size_t store_count(const store_t *s) { return lru_count(s->cache); }

static void unlink_cb(ht_entry_t *e, void *ctx) { lru_unlink(((store_t *)ctx)->cache, e); }

/** @id CODE-STORE-005 @implements REQ-STORE-005 REQ-STORE-006 */
static void make_room(store_t *s, const uint8_t *key, size_t klen) {
  ht_t *t = lru_table(s->cache);
  if (ht_get(t, key, klen) != NULL || lru_count(s->cache) < s->cap) return;
  ttl_sweep(t, &s->clock, unlink_cb, s);
}

/** @id CODE-STORE-010 @implements REQ-STORE-010 */
int store_set(store_t *s, const uint8_t *key, size_t klen, const uint8_t *val, size_t vlen, uint32_t ttl_ms) {
  if (!s || !key || klen == 0) return KV_EINVAL;
  uint64_t exp;
  if (ttl_expires_at(&s->clock, ttl_ms, &exp) != KV_OK) return KV_EINVAL;
  make_room(s, key, klen);
  ht_entry_t *e = lru_put(s->cache, key, klen, val, vlen);
  if (!e) return KV_EINVAL;
  e->expires_at = exp;
  return KV_OK;
}

/** @id CODE-STORE-003 @implements REQ-STORE-002 REQ-STORE-003 REQ-STORE-004 */
int store_get(store_t *s, const uint8_t *key, size_t klen, const uint8_t **val, size_t *vlen) {
  if (!s || !key || !val || !vlen) return KV_EINVAL;
  ht_entry_t *e = lru_get(s->cache, key, klen);
  if (!e) return 1;
  if (ttl_is_expired(e, s->clock.now(s->clock.ctx))) {
    lru_del(s->cache, key, klen);
    return 1;
  }
  *val = e->val;
  *vlen = e->vlen;
  return 0;
}

int store_del(store_t *s, const uint8_t *key, size_t klen) {
  if (!s || !key) return KV_EINVAL;
  return lru_del(s->cache, key, klen) == 0 ? 0 : 1;
}

static int write_status(uint8_t st, const uint8_t *val, size_t vlen, uint8_t *out, size_t cap, size_t *out_len) {
  return proto_encode_response(st, val, vlen, out, cap, out_len);
}

/** @id CODE-STORE-007 @implements REQ-STORE-007 REQ-STORE-008 */
int store_handle(store_t *s, const uint8_t *in, size_t len, uint8_t *out, size_t cap, size_t *out_len, size_t *consumed) {
  proto_req_t r;
  if (!s || !out || !out_len || !consumed) return PROTO_EINVAL;
  *out_len = 0;
  int rc = proto_parse(in, len, &r, consumed);
  if (rc == PROTO_NEED_MORE) return rc;
  if (rc != PROTO_OK) {
    write_status(STORE_ST_ERR, NULL, 0, out, cap, out_len);
    return rc;
  }
  uint8_t st = STORE_ST_OK;
  const uint8_t *v = NULL; size_t vl = 0;
  if (r.op == PROTO_OP_SET) {
    if (store_set(s, r.key, r.klen, r.val, r.vlen, r.ttl_ms) != 0) st = STORE_ST_ERR;
  } else if (r.op == PROTO_OP_GET) {
    if (store_get(s, r.key, r.klen, &v, &vl) != 0) { st = STORE_ST_NOTFOUND; v = NULL; vl = 0; }
  } else {
    if (store_del(s, r.key, r.klen) != 0) st = STORE_ST_NOTFOUND;
  }
  if (write_status(st, v, vl, out, cap, out_len) != PROTO_OK) { *consumed = 0; return PROTO_ENOSPACE; }
  return PROTO_OK;
}

/** @id CODE-STORE-009 @implements REQ-STORE-009 */
int store_feed(store_t *s, const uint8_t *in, size_t len, uint8_t *out, size_t cap, size_t *out_len, size_t *consumed) {
  if (!s || !in || !out || !out_len || !consumed) return PROTO_EINVAL;
  size_t pos = 0, w = 0;
  int rc = PROTO_OK;
  while (pos < len) {
    size_t used = 0, ow = 0;
    rc = store_handle(s, in + pos, len - pos, out + w, cap - w, &ow, &used);
    w += ow;
    if (rc == PROTO_NEED_MORE) { rc = PROTO_OK; break; }
    if (rc != PROTO_OK) break;
    pos += used;
  }
  *out_len = w;
  *consumed = pos;
  return rc;
}
