#ifndef KV_COMMON_H
#define KV_COMMON_H
#include <stddef.h>
#include <stdint.h>

#define KV_OK 0
#define KV_EINVAL (-1)

typedef struct {
  uint64_t (*now)(void *ctx);
  void *ctx;
} kv_clock_t;
#endif
