#include "kv/protocol.h"

static uint32_t rd32(const uint8_t *p) {
  return ((uint32_t)p[0] << 24) | ((uint32_t)p[1] << 16) | ((uint32_t)p[2] << 8) | (uint32_t)p[3];
}

/** @id CODE-PROTO-001 @implements REQ-PROTO-001 REQ-PROTO-002 REQ-PROTO-003 REQ-PROTO-008 REQ-PROTO-009 REQ-PROTO-011 */
int proto_parse(const uint8_t *buf, size_t len, proto_req_t *out, size_t *consumed) {
  if (!buf || !out || !consumed) return PROTO_EINVAL;
  *consumed = 0;
  if (len < PROTO_HEADER_LEN) return PROTO_NEED_MORE;
  /** @id CODE-PROTO-004 @implements REQ-PROTO-004 */
  if (buf[0] != PROTO_MAGIC) return PROTO_EBADMAGIC;
  uint8_t op = buf[1];
  /** @id CODE-PROTO-005 @implements REQ-PROTO-005 */
  if (op < PROTO_OP_GET || op > PROTO_OP_DEL) return PROTO_EBADOP;
  size_t klen = ((size_t)buf[2] << 8) | buf[3];
  uint32_t vlen32 = rd32(buf + 4);
  /** @id CODE-PROTO-006 @implements REQ-PROTO-006 */
  if (klen == 0 || klen > PROTO_MAX_KEY || vlen32 > PROTO_MAX_VALUE) return PROTO_ELIMIT;
  size_t vlen = vlen32;
  /** @id CODE-PROTO-007 @implements REQ-PROTO-007 */
  if (op != PROTO_OP_SET && vlen != 0) return PROTO_EBADLEN;
  size_t total = PROTO_HEADER_LEN + klen + vlen;
  if (len < total) return PROTO_NEED_MORE;
  out->op = op;
  out->klen = klen;
  out->vlen = vlen;
  out->ttl_ms = rd32(buf + 8);
  out->key = buf + PROTO_HEADER_LEN;
  out->val = buf + PROTO_HEADER_LEN + klen;
  *consumed = total;
  return PROTO_OK;
}

/** @id CODE-PROTO-010 @implements REQ-PROTO-010 */
int proto_encode_response(uint8_t status, const uint8_t *val, size_t vlen, uint8_t *out, size_t cap, size_t *written) {
  if (!out || !written || (!val && vlen) || vlen > PROTO_MAX_VALUE) return PROTO_EINVAL;
  size_t total = 6 + vlen;
  if (cap < total) return PROTO_ENOSPACE;
  out[0] = PROTO_MAGIC;
  out[1] = status;
  out[2] = (uint8_t)(vlen >> 24);
  out[3] = (uint8_t)(vlen >> 16);
  out[4] = (uint8_t)(vlen >> 8);
  out[5] = (uint8_t)vlen;
  for (size_t i = 0; i < vlen; i++) out[6 + i] = val[i];
  *written = total;
  return PROTO_OK;
}
