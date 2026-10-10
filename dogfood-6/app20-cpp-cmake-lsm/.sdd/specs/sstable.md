---
feature: sstable
tier: T2
approval: auto
---
# sstable
Goal: an immutable, checksummed, block-structured sorted table (in-memory byte buffer) with index, Bloom filter and footer, written from ordered entries or a memtable. Non-goals: file I/O, compression, prefix compression, multi-threading.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SST-001 | The system shall encode unsigned integers as LEB128 varints that round-trip for 0, 127, 128, 2^32 and UINT64_MAX; decoding a truncated or over-long (>10 byte) varint shall throw lsm::FormatError. | TEST-SST-001 |
| REQ-SST-002 | The system shall compute CRC-32 (IEEE) such that crc32("123456789") = 0xCBF43926 and crc32("") = 0. | TEST-SST-002 |
| REQ-SST-003 | If an entry is added whose (key asc, seq desc) position is not strictly after the previous entry, then SstWriter::add shall throw std::invalid_argument; the same key with a lower seq shall be accepted. | TEST-SST-003 |
| REQ-SST-004 | When a data block's payload reaches block_size the writer shall close it, so no entry is split and every block except the last has payload >= block_size. | TEST-SST-004 |
| REQ-SST-005 | When finish() is called, the buffer shall end with a 48-byte footer whose last 8 bytes are the magic 0x4C534D5353543031 (little endian) and whose entry-count field equals the number of added entries. | TEST-SST-005 |
| REQ-SST-006 | When get(key, snapshot) is called, the reader shall return the newest version with seq <= snapshot as Found or Deleted, else NotFound. | TEST-SST-006 |
| REQ-SST-007 | While the Bloom filter reports a key absent, get shall perform zero data-block reads. | TEST-SST-007 |
| REQ-SST-008 | The reader's full iteration shall yield exactly the added entries in order. | TEST-SST-008 |
| REQ-SST-009 | If a data, index or Bloom block fails its CRC-32, then the operation touching it shall throw lsm::CorruptionError. | TEST-SST-009 |
| REQ-SST-010 | If the buffer is shorter than the footer, has a wrong magic, or footer offsets exceed the buffer, then opening shall throw lsm::FormatError. | TEST-SST-010 |
| REQ-SST-011 | When seek(key) is called, the iterator shall point at the first entry with user key >= key even when it lies in a later block, or be invalid past the end. | TEST-SST-011 |
| REQ-SST-012 | The reader shall expose min_key, max_key and entry_count; a table with no entries shall be valid and empty. | TEST-SST-012 |
| REQ-SST-013 | When a memtable is flushed with write_sstable, iterating the table shall equal memtable.entries(), including all versions and tombstones. | TEST-SST-013 |

## Design
Components: `coding.hpp` (varint, fixed LE ints, crc32), `sstable.hpp` (SstWriter, SstReader, SstIterator, write_sstable) using `bloom.hpp` and `memtable.hpp`. Data flow: add -> block buffer -> (size >= block_size) seal block + crc -> index entry; finish -> index block, bloom block, footer. Read: footer -> index (binary search by last internal key) -> block (crc) -> linear scan.

| Region | Layout |
| --- | --- |
| data block | entries [varint klen, varint vlen, u64 seq, u8 type, key, value]* then u32 crc32(payload) |
| index block | varint nblocks, varint+min_key, varint+max_key, per block [varint klen, last_key, u64 last_seq, u64 offset, u32 payload size] then u32 crc |
| bloom block | BloomFilter::serialize of user keys, then u32 crc |
| footer (48 B) | u64 bloom_off, bloom_size, index_off, index_size, entry_count, magic |

| Reader state | Operation | Result |
| --- | --- | --- |
| Open (validated footer, index, bloom CRCs) | get/seek/iterate | data blocks read lazily, CRC checked per read |
| Open | bad block CRC | CorruptionError (no partial data) |
| Closed (construction failed) | any | FormatError/CorruptionError at construction |

Invariants: block last keys strictly increase; entries strictly increase in internal order; Bloom holds every user key; offset+size within the buffer.

## Assumptions / risks
Spike: std::string buffers up to a few MB are adequate (no mmap). Same-key versions spanning blocks are handled by indexing the last (key,seq) pair; retired by TEST-SST-006 and TEST-SST-011.
