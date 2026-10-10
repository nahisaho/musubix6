#ifndef KV_HASHTABLE_H
#define KV_HASHTABLE_H
#include "kv/common.h"

typedef struct ht ht_t;
typedef struct ht_entry {
  uint8_t *key;
  size_t klen;
  uint8_t *val;
  size_t vlen;
  uint32_t hash;
  struct ht_entry *next;     /* bucket chain */
  struct ht_entry *lru_prev; /* owned by lru module */
  struct ht_entry *lru_next;
  uint64_t expires_at;       /* owned by ttl module; 0 = never */
} ht_entry_t;

typedef void (*ht_remove_cb)(ht_entry_t *e, void *ctx);
typedef int (*ht_pred)(const ht_entry_t *e, void *ctx);

ht_t *ht_new(void);
void ht_free(ht_t *t);
size_t ht_count(const ht_t *t);
size_t ht_capacity(const ht_t *t);
ht_entry_t *ht_put(ht_t *t, const uint8_t *key, size_t klen, const uint8_t *val, size_t vlen);
ht_entry_t *ht_get(const ht_t *t, const uint8_t *key, size_t klen);
int ht_del(ht_t *t, const uint8_t *key, size_t klen);
size_t ht_remove_if(ht_t *t, ht_pred pred, void *pred_ctx, ht_remove_cb on_remove, void *rm_ctx);
#endif
