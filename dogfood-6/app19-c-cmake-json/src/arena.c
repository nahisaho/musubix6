#include "arena.h"
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

#define DEFAULT_BLOCK 4096

typedef struct block {
  struct block *next;
  size_t cap, used;
  unsigned char data[];
} block;

typedef struct { size_t id, block_index, offset; } mark_rec;

struct arena {
  block *head, *cur;
  size_t block_size, nblocks, reserved, used, limit, next_id;
  mark_rec *marks;
  size_t nmarks, capmarks;
  arena_err err;
};

static block *block_new(size_t cap) {
  if (cap > SIZE_MAX - sizeof(block)) return NULL;
  block *b = malloc(sizeof(block) + cap);
  if (!b) return NULL;
  b->next = NULL; b->cap = cap; b->used = 0;
  return b;
}

/** @id CODE-ARENA-001 @implements REQ-ARENA-001 */
arena_t *arena_new(size_t block_size) {
  arena_t *a = calloc(1, sizeof *a);
  if (!a) return NULL;
  a->block_size = block_size ? block_size : DEFAULT_BLOCK;
  a->head = a->cur = block_new(a->block_size);
  if (!a->head) { free(a); return NULL; }
  a->nblocks = 1; a->reserved = a->block_size; a->next_id = 1;
  return a;
}

static void free_blocks_after(arena_t *a, block *keep) {
  block *b = keep->next;
  keep->next = NULL;
  while (b) { block *n = b->next; a->reserved -= b->cap; a->nblocks--; free(b); b = n; }
}

/** @id CODE-ARENA-002 @implements REQ-ARENA-011 */
void arena_free(arena_t *a) {
  if (!a) return;
  block *b = a->head;
  while (b) { block *n = b->next; free(b); b = n; }
  free(a->marks);
  free(a);
}

/** @id CODE-ARENA-003 @implements REQ-ARENA-011 */
void arena_reset(arena_t *a) {
  if (!a) return;
  free_blocks_after(a, a->head);
  a->head->used = 0; a->cur = a->head; a->used = 0; a->nmarks = 0;
  a->err = ARENA_OK;
}

/** @id CODE-ARENA-004 @implements REQ-ARENA-002 REQ-ARENA-003 REQ-ARENA-004 REQ-ARENA-005 REQ-ARENA-006 REQ-ARENA-010 */
void *arena_alloc(arena_t *a, size_t n, size_t align) {
  if (!a) return NULL;
  if (align == 0 || (align & (align - 1))) { a->err = ARENA_ERR_ALIGN; return NULL; }
  if (n > SIZE_MAX - align) { a->err = ARENA_ERR_OVERFLOW; return NULL; }
  block *b = a->cur;
  uintptr_t base = (uintptr_t)b->data + b->used;
  size_t pad = (size_t)(((base + align - 1) & ~(uintptr_t)(align - 1)) - base);
  if (pad <= b->cap - b->used && n <= b->cap - b->used - pad) {
    void *p = b->data + b->used + pad;
    b->used += pad + n; a->used += pad + n;
    memset(p, 0, n);
    return p;
  }
  size_t want = n + align;
  if (want < a->block_size) want = a->block_size;
  if (want > SIZE_MAX - a->reserved || a->reserved + want > (a->limit ? a->limit : SIZE_MAX)) {
    a->err = ARENA_ERR_LIMIT; return NULL;
  }
  block *nb = block_new(want);
  if (!nb) { a->err = ARENA_ERR_NOMEM; return NULL; }
  b->next = nb; a->cur = nb; a->nblocks++; a->reserved += want;
  base = (uintptr_t)nb->data;
  pad = (size_t)(((base + align - 1) & ~(uintptr_t)(align - 1)) - base);
  void *p = nb->data + pad;
  nb->used = pad + n; a->used += pad + n;
  memset(p, 0, n);
  return p;
}

/** @id CODE-ARENA-005 @implements REQ-ARENA-009 */
char *arena_strndup(arena_t *a, const char *s, size_t n) {
  size_t len = 0;
  while (len < n && s[len]) len++;
  char *d = arena_alloc(a, len + 1, 1);
  if (!d) return NULL;
  memcpy(d, s, len);
  d[len] = '\0';
  return d;
}

/** @id CODE-ARENA-006 @implements REQ-ARENA-007 REQ-ARENA-008 */
arena_mark_t arena_mark(arena_t *a) {
  arena_mark_t m = {0, 0};
  if (a->nmarks == a->capmarks) {
    size_t nc = a->capmarks ? a->capmarks * 2 : 8;
    mark_rec *nm = realloc(a->marks, nc * sizeof *nm);
    if (!nm) { a->err = ARENA_ERR_NOMEM; return m; }
    a->marks = nm; a->capmarks = nc;
  }
  mark_rec *r = &a->marks[a->nmarks];
  r->id = a->next_id++; r->block_index = a->nblocks - 1; r->offset = a->cur->used;
  m.id = r->id; m.depth = a->nmarks++;
  return m;
}

arena_err arena_rewind(arena_t *a, arena_mark_t m) {
  if (m.depth >= a->nmarks || a->marks[m.depth].id != m.id) return ARENA_ERR_BADMARK;
  mark_rec r = a->marks[m.depth];
  block *b = a->head;
  for (size_t i = 0; i < r.block_index; i++) b = b->next;
  free_blocks_after(a, b);
  b->used = r.offset; a->cur = b;
  size_t sum = 0;
  for (block *x = a->head; x; x = x->next) sum += x->used;
  a->used = sum;
  a->nmarks = m.depth + 1;
  return ARENA_OK;
}

void arena_set_limit(arena_t *a, size_t max_reserved) { a->limit = max_reserved; }
arena_err arena_last_error(const arena_t *a) { return a->err; }
size_t arena_used(const arena_t *a) { return a->used; }
size_t arena_reserved(const arena_t *a) { return a->reserved; }
size_t arena_block_count(const arena_t *a) { return a->nblocks; }
size_t arena_block_size(const arena_t *a) { return a->block_size; }
