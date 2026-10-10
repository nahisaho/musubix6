#ifndef KV_LRU_H
#define KV_LRU_H
#include "kv/common.h"
#include "kv/hashtable.h"

typedef struct lru lru_t;
typedef void (*lru_evict_cb)(const uint8_t *key, size_t klen, void *ctx);

lru_t *lru_new(size_t capacity);
void lru_free(lru_t *c);
void lru_set_evict_cb(lru_t *c, lru_evict_cb cb, void *ctx);
ht_t *lru_table(lru_t *c);
size_t lru_count(const lru_t *c);
const ht_entry_t *lru_mru(const lru_t *c);
const ht_entry_t *lru_lru(const lru_t *c);
ht_entry_t *lru_put(lru_t *c, const uint8_t *key, size_t klen, const uint8_t *val, size_t vlen);
ht_entry_t *lru_get(lru_t *c, const uint8_t *key, size_t klen);
int lru_del(lru_t *c, const uint8_t *key, size_t klen);
void lru_unlink(lru_t *c, ht_entry_t *e);
#endif
