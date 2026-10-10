#include "kv/ttl.h"

/** @id CODE-TTL-001 @implements REQ-TTL-001 REQ-TTL-002 REQ-TTL-003 REQ-TTL-007 */
int ttl_expires_at(const kv_clock_t *clock, uint64_t ttl_ms, uint64_t *out) {
  if (!clock || !clock->now || !out) return KV_EINVAL;
  if (ttl_ms == 0) { *out = 0; return KV_OK; }
  uint64_t now = clock->now(clock->ctx);
  *out = (ttl_ms > UINT64_MAX - now) ? UINT64_MAX : now + ttl_ms;
  return KV_OK;
}

/** @id CODE-TTL-004 @implements REQ-TTL-004 */
int ttl_is_expired(const ht_entry_t *e, uint64_t now) {
  return e->expires_at != 0 && now >= e->expires_at;
}

/** @id CODE-TTL-005 @implements REQ-TTL-005 */
int64_t ttl_remaining(const ht_entry_t *e, uint64_t now) {
  if (e->expires_at == 0) return -1;
  if (now >= e->expires_at) return 0;
  uint64_t left = e->expires_at - now;
  return left > (uint64_t)INT64_MAX ? INT64_MAX : (int64_t)left;
}

struct sweep_ctx { uint64_t now; };

static int expired_pred(const ht_entry_t *e, void *ctx) {
  return ttl_is_expired(e, ((struct sweep_ctx *)ctx)->now);
}

/** @id CODE-TTL-006 @implements REQ-TTL-006 */
size_t ttl_sweep(ht_t *t, const kv_clock_t *clock, ht_remove_cb on_remove, void *ctx) {
  if (!t || !clock || !clock->now) return 0;
  struct sweep_ctx sc = { clock->now(clock->ctx) };
  return ht_remove_if(t, expired_pred, &sc, on_remove, ctx);
}
