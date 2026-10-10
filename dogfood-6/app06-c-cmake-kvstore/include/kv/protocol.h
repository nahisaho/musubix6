#ifndef KV_PROTOCOL_H
#define KV_PROTOCOL_H
#include "kv/common.h"

#define PROTO_MAGIC 0xB5
#define PROTO_HEADER_LEN 12
#define PROTO_MAX_KEY 250
#define PROTO_MAX_VALUE 1048576

#define PROTO_OK 0
#define PROTO_NEED_MORE 1
#define PROTO_EINVAL (-1)
#define PROTO_EBADMAGIC (-2)
#define PROTO_EBADOP (-3)
#define PROTO_ELIMIT (-4)
#define PROTO_EBADLEN (-5)
#define PROTO_ENOSPACE (-6)

typedef enum { PROTO_OP_GET = 1, PROTO_OP_SET = 2, PROTO_OP_DEL = 3 } proto_op_t;

typedef struct {
  uint8_t op;
  const uint8_t *key;
  size_t klen;
  const uint8_t *val;
  size_t vlen;
  uint32_t ttl_ms;
} proto_req_t;

int proto_parse(const uint8_t *buf, size_t len, proto_req_t *out, size_t *consumed);
int proto_encode_response(uint8_t status, const uint8_t *val, size_t vlen, uint8_t *out, size_t cap, size_t *written);
#endif
