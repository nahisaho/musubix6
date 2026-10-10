#ifndef FRAMES_H
#define FRAMES_H
#include <stdint.h>
#include <string.h>

static inline size_t frame(uint8_t *b, uint8_t op, const char *key, const char *val, uint32_t ttl) {
  size_t kl = strlen(key), vl = val ? strlen(val) : 0;
  b[0] = 0xB5; b[1] = op;
  b[2] = (uint8_t)(kl >> 8); b[3] = (uint8_t)kl;
  b[4] = b[5] = 0; b[6] = (uint8_t)(vl >> 8); b[7] = (uint8_t)vl;
  b[8] = (uint8_t)(ttl >> 24); b[9] = (uint8_t)(ttl >> 16); b[10] = (uint8_t)(ttl >> 8); b[11] = (uint8_t)ttl;
  memcpy(b + 12, key, kl);
  if (vl) memcpy(b + 12 + kl, val, vl);
  return 12 + kl + vl;
}
#endif
