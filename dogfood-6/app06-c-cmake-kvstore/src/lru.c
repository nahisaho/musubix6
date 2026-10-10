#include <stdlib.h>
#include "kv/lru.h"

struct lru {
  ht_t *ht;
  ht_entry_t *head; /* most recently used */
  ht_entry_t *tail; /* least recently used */
  size_t cap;
  lru_evict_cb on_evict;
  void *evict_ctx;
};

/** @id CODE-LRU-001 @implements REQ-LRU-001 */
lru_t *lru_new(size_t capacity) {
  if (capacity == 0) return NULL;
  lru_t *c = calloc(1, sizeof *c);
  if (!c) return NULL;
  c->ht = ht_new();
  if (!c->ht) { free(c); return NULL; }
  c->cap = capacity;
  return c;
}

void lru_free(lru_t *c) {
  if (!c) return;
  ht_free(c->ht);
  free(c);
}

void lru_set_evict_cb(lru_t *c, lru_evict_cb cb, void *ctx) {
  c->on_evict = cb;
  c->evict_ctx = ctx;
}

ht_t *lru_table(lru_t *c) { return c->ht; }
size_t lru_count(const lru_t *c) { return ht_count(c->ht); }
const ht_entry_t *lru_mru(const lru_t *c) { return c->head; }
const ht_entry_t *lru_lru(const lru_t *c) { return c->tail; }

/** @id CODE-LRU-006 @implements REQ-LRU-006 */
void lru_unlink(lru_t *c, ht_entry_t *e) {
  if (e->lru_prev) e->lru_prev->lru_next = e->lru_next; else if (c->head == e) c->head = e->lru_next;
  if (e->lru_next) e->lru_next->lru_prev = e->lru_prev; else if (c->tail == e) c->tail = e->lru_prev;
  e->lru_prev = e->lru_next = NULL;
}

static void link_head(lru_t *c, ht_entry_t *e) {
  e->lru_prev = NULL;
  e->lru_next = c->head;
  if (c->head) c->head->lru_prev = e;
  c->head = e;
  if (!c->tail) c->tail = e;
}

static void touch(lru_t *c, ht_entry_t *e) {
  if (c->head == e) return;
  lru_unlink(c, e);
  link_head(c, e);
}

/** @id CODE-LRU-004 @implements REQ-LRU-004 */
ht_entry_t *lru_get(lru_t *c, const uint8_t *key, size_t klen) {
  ht_entry_t *e = ht_get(c->ht, key, klen);
  if (e) touch(c, e);
  return e;
}

/** @id CODE-LRU-003 @implements REQ-LRU-003 REQ-LRU-007 */
static void evict_tail(lru_t *c) {
  ht_entry_t *victim = c->tail;
  if (!victim) return;
  if (c->on_evict) c->on_evict(victim->key, victim->klen, c->evict_ctx);
  lru_unlink(c, victim);
  ht_del(c->ht, victim->key, victim->klen);
}

/** @id CODE-LRU-002 @implements REQ-LRU-002 REQ-LRU-005 */
ht_entry_t *lru_put(lru_t *c, const uint8_t *key, size_t klen, const uint8_t *val, size_t vlen) {
  int existed = ht_get(c->ht, key, klen) != NULL;
  ht_entry_t *e = ht_put(c->ht, key, klen, val, vlen);
  if (!e) return NULL;
  if (existed) {
    touch(c, e);
    return e;
  }
  link_head(c, e);
  while (ht_count(c->ht) > c->cap) evict_tail(c);
  return e;
}

int lru_del(lru_t *c, const uint8_t *key, size_t klen) {
  ht_entry_t *e = ht_get(c->ht, key, klen);
  if (!e) return -1;
  lru_unlink(c, e);
  return ht_del(c->ht, key, klen);
}
