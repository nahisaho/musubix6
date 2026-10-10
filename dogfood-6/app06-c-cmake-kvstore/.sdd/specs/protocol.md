---
feature: protocol
tier: T2
approval: auto
---
# protocol
Goal: bounds-checked binary frame parser and encoder. Non-goals: network I/O, compression.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PROTO-001 | When a complete valid request frame is supplied, proto_parse shall return PROTO_OK with op, key, value, ttl and the consumed byte count. | TEST-PROTO-001 |
| REQ-PROTO-002 | If fewer than 12 header bytes are supplied, then proto_parse shall return PROTO_NEED_MORE and consume 0 bytes. | TEST-PROTO-002 |
| REQ-PROTO-003 | If the header is complete but key or value bytes are missing, then proto_parse shall return PROTO_NEED_MORE. | TEST-PROTO-003 |
| REQ-PROTO-004 | If the first byte is not the magic 0xB5, then proto_parse shall return PROTO_EBADMAGIC. | TEST-PROTO-004 |
| REQ-PROTO-005 | If the opcode is not GET(1), SET(2) or DEL(3), then proto_parse shall return PROTO_EBADOP. | TEST-PROTO-005 |
| REQ-PROTO-006 | If key length is 0 or above 250, or value length is above 1048576, then proto_parse shall return PROTO_ELIMIT before waiting for the body. | TEST-PROTO-006 |
| REQ-PROTO-007 | If a GET or DEL frame has a non-zero value length, then proto_parse shall return PROTO_EBADLEN. | TEST-PROTO-007 |
| REQ-PROTO-008 | If the buffer or output pointer is NULL, then proto_parse shall return PROTO_EINVAL. | TEST-PROTO-008 |
| REQ-PROTO-009 | When proto_parse succeeds, the system shall point key and value into the input buffer without reading past len. | TEST-PROTO-009 |
| REQ-PROTO-010 | When proto_encode_response is called, the system shall write magic, status, big-endian value length and value, and return PROTO_ENOSPACE without writing when the capacity is too small. | TEST-PROTO-010 |
| REQ-PROTO-011 | When two frames are concatenated, proto_parse shall consume exactly the first frame length. | TEST-PROTO-011 |

## Design
- Frame table (single source, big-endian): [0]=0xB5 magic, [1]=op, [2..3]=klen u16, [4..7]=vlen u32, [8..11]=ttl_ms u32, then key[klen], value[vlen]. Response: [0]=0xB5, [1]=status, [2..5]=vlen u32, value.
- Validation order: size>=12 -> magic -> op -> limits -> op/vlen shape -> total = 12+klen+vlen (size_t, max ~1MiB so no overflow) -> len>=total else NEED_MORE.
- Decisions: parser is zero-copy and stateless; limits are rejected from the header alone so a hostile length cannot stall a connection.
- Status: OK(0) NEED_MORE(1) ERR codes negative.
## Assumptions / risks
- Header-only rejection means magic is checked before waiting: TEST-PROTO-004/006.
