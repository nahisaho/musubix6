---
feature: codec
tier: T2
---
# codec
Goal: integer compression primitives for postings: variable byte, gap coding, frame-of-reference bit packing.
Non-goals: SIMD, Elias-Fano.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CODEC-001 | When non-negative ints are VByte encoded then decoded, the system shall return the identical values (0,127,128,16383,16384,Integer.MAX_VALUE included). | TEST-CODEC-001 |
| REQ-CODEC-002 | When a value is VByte encoded, the system shall use 1 byte below 128, 2 below 16384 and 5 bytes for Integer.MAX_VALUE (7 bits per byte, low group first, 0x80 = continuation). | TEST-CODEC-002 |
| REQ-CODEC-003 | If a value to encode is negative, then the system shall throw IllegalArgumentException. | TEST-CODEC-003 |
| REQ-CODEC-004 | If the input ends inside a multi-byte value, then VByte decode shall throw CodecException. | TEST-CODEC-004 |
| REQ-CODEC-005 | If a value spans more than 5 bytes or exceeds Integer.MAX_VALUE, then VByte decode shall throw CodecException. | TEST-CODEC-005 |
| REQ-CODEC-006 | When a strictly increasing int sequence (possibly empty, starting at 0) is gap encoded then decoded, the system shall return it unchanged. | TEST-CODEC-006 |
| REQ-CODEC-007 | If the sequence is not strictly increasing or has a negative value, then gap encode shall throw IllegalArgumentException; if decoding overflows int, then it shall throw CodecException. | TEST-CODEC-007 |
| REQ-CODEC-008 | When a block is FOR packed then unpacked, the system shall return identical values using width = 32 - nlz(max) bits per value. | TEST-CODEC-008 |
| REQ-CODEC-009 | When every value of a block is 0, FOR packing shall use width 0 and no payload bytes. | TEST-CODEC-009 |
| REQ-CODEC-010 | If a packed block is truncated or has trailing bytes, then FOR unpack shall throw CodecException. | TEST-CODEC-010 |
| REQ-CODEC-011 | If a packed header declares a count above 1048576, then FOR unpack shall throw CodecException before allocating. | TEST-CODEC-011 |

## Design
Decoder state machine for VByte (one value at a time):

| State | Input byte | Next | Action |
| --- | --- | --- | --- |
| START | b < 0x80 | START | emit value |
| START | b >= 0x80 | CONT(n=1) | acc = b & 0x7f |
| CONT(n) | b < 0x80, n<=4 | START | emit acc \| b << 7n; reject if > MAX_INT |
| CONT(n) | b >= 0x80, n<4 | CONT(n+1) | accumulate |
| CONT(4) | b >= 0x80 | ERROR | overlong |
| CONT(n) | end of input | ERROR | truncated |

Invariants:

| Id | Invariant |
| --- | --- |
| I1 | decode(encode(x)) == x for all x >= 0 |
| I2 | encoded length is minimal (no zero-padded groups) |
| I3 | FOR block layout = vbyte(count), 1 byte width, ceil(count*width/8) payload bytes, LSB-first bit order |
| I4 | gap(x)[0] = x[0]; gap(x)[i] = x[i]-x[i-1] >= 1 |

## Assumptions / risks
- 5th byte may carry at most 3 bits (value <= 0x07): TEST-CODEC-005.
