#include <stdlib.h>
#include <string.h>
#include "kv/hashtable.h"

#define HT_INIT_CAP 8

struct ht {
  ht_entry_t **buckets;
  size_t cap;
  size_t count;
};

static uint32_t hash_bytes(const uint8_t *key, size_t len) {
  uint32_t h = 2166136261u;
  for (size_t i = 0; i < len; i++) {
    h ^= key[i];
    h *= 16777619u;
  }
  return h;
}

/** @id CODE-HT-001 @implements REQ-HT-001 */
ht_t *ht_new(void) {
  ht_t *t = calloc(1, sizeof *t);
  if (!t) return NULL;
  t->buckets = calloc(HT_INIT_CAP, sizeof *t->buckets);
  if (!t->buckets) { free(t); return NULL; }
  t->cap = HT_INIT_CAP;
  return t;
}

static void entry_free(ht_entry_t *e) {
  free(e->key);
  free(e->val);
  free(e);
}

void ht_free(ht_t *t) {
  if (!t) return;
  for (size_t i = 0; i < t->cap; i++) {
    ht_entry_t *e = t->buckets[i];
    while (e) { ht_entry_t *n = e->next; entry_free(e); e = n; }
  }
  free(t->buckets);
  free(t);
}

size_t ht_count(const ht_t *t) { return t->count; }
size_t ht_capacity(const ht_t *t) { return t->cap; }

/** @id CODE-HT-007 @implements REQ-HT-007 */
static int key_eq(const ht_entry_t *e, uint32_t h, const uint8_t *key, size_t klen) {
  return e->hash == h && e->klen == klen && memcmp(e->key, key, klen) == 0;
}

/** @id CODE-HT-004 @implements REQ-HT-004 */
ht_entry_t *ht_get(const ht_t *t, const uint8_t *key, size_t klen) {
  if (!t || !key) return NULL;
  uint32_t h = hash_bytes(key, klen);
  for (ht_entry_t *e = t->buckets[h & (t->cap - 1)]; e; e = e->next)
    if (key_eq(e, h, key, klen)) return e;
  return NULL;
}

/** @id CODE-HT-006 @implements REQ-HT-006 */
static int ht_grow(ht_t *t) {
  size_t ncap = t->cap * 2;
  ht_entry_t **nb = calloc(ncap, sizeof *nb);
  if (!nb) return -1;
  for (size_t i = 0; i < t->cap; i++) {
    ht_entry_t *e = t->buckets[i];
    while (e) {
      ht_entry_t *n = e->next;
      size_t idx = e->hash & (ncap - 1);
      e->next = nb[idx];
      nb[idx] = e;
      e = n;
    }
  }
  free(t->buckets);
  t->buckets = nb;
  t->cap = ncap;
  return 0;
}

static uint8_t *dup_bytes(const uint8_t *src, size_t n) {
  uint8_t *p = malloc(n ? n : 1);
  if (p && n) memcpy(p, src, n);
  return p;
}

/** @id CODE-HT-002 @implements REQ-HT-002 REQ-HT-003 REQ-HT-008 */
ht_entry_t *ht_put(ht_t *t, const uint8_t *key, size_t klen, const uint8_t *val, size_t vlen) {
  if (!t || !key || (!val && vlen)) return NULL;
  ht_entry_t *e = ht_get(t, key, klen);
  if (e) {
    uint8_t *nv = dup_bytes(val, vlen);
    if (!nv) return NULL;
    free(e->val);
    e->val = nv;
    e->vlen = vlen;
    return e;
  }
  e = calloc(1, sizeof *e);
  if (!e) return NULL;
  e->key = dup_bytes(key, klen);
  e->val = dup_bytes(val, vlen);
  if (!e->key || !e->val) { entry_free(e); return NULL; }
  e->klen = klen;
  e->vlen = vlen;
  e->hash = hash_bytes(key, klen);
  size_t idx = e->hash & (t->cap - 1);
  e->next = t->buckets[idx];
  t->buckets[idx] = e;
  t->count++;
  if (t->count * 4 > t->cap * 3) ht_grow(t);
  return e;
}

/** @id CODE-HT-005 @implements REQ-HT-005 */
int ht_del(ht_t *t, const uint8_t *key, size_t klen) {
  if (!t || !key) return -1;
  uint32_t h = hash_bytes(key, klen);
  ht_entry_t **pp = &t->buckets[h & (t->cap - 1)];
  for (; *pp; pp = &(*pp)->next) {
    if (key_eq(*pp, h, key, klen)) {
      ht_entry_t *dead = *pp;
      *pp = dead->next;
      entry_free(dead);
      t->count--;
      return 0;
    }
  }
  return -1;
}

/** @id CODE-HT-009 @implements REQ-HT-009 */
size_t ht_remove_if(ht_t *t, ht_pred pred, void *pred_ctx, ht_remove_cb on_remove, void *rm_ctx) {
  size_t removed = 0;
  if (!t || !pred) return 0;
  for (size_t i = 0; i < t->cap; i++) {
    ht_entry_t **pp = &t->buckets[i];
    while (*pp) {
      ht_entry_t *e = *pp;
      if (pred(e, pred_ctx)) {
        if (on_remove) on_remove(e, rm_ctx);
        *pp = e->next;
        entry_free(e);
        t->count--;
        removed++;
      } else {
        pp = &e->next;
      }
    }
  }
  return removed;
}
