#ifndef ARENA_H
#define ARENA_H
#include <stddef.h>

typedef enum { ARENA_OK = 0, ARENA_ERR_ALIGN, ARENA_ERR_OVERFLOW, ARENA_ERR_LIMIT, ARENA_ERR_BADMARK, ARENA_ERR_NOMEM } arena_err;
typedef struct arena arena_t;
typedef struct { size_t id; size_t depth; } arena_mark_t;

arena_t *arena_new(size_t block_size);
void arena_free(arena_t *a);
void arena_reset(arena_t *a);
void *arena_alloc(arena_t *a, size_t n, size_t align);
char *arena_strndup(arena_t *a, const char *s, size_t n);
arena_mark_t arena_mark(arena_t *a);
arena_err arena_rewind(arena_t *a, arena_mark_t m);
void arena_set_limit(arena_t *a, size_t max_reserved);
arena_err arena_last_error(const arena_t *a);
size_t arena_used(const arena_t *a);
size_t arena_reserved(const arena_t *a);
size_t arena_block_count(const arena_t *a);
size_t arena_block_size(const arena_t *a);
#endif
