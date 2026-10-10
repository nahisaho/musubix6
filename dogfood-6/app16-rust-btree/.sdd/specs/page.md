---
feature: page
tier: T1
---
# page
Goal: fixed-size slotted pages with CRC32 integrity. Non-goals: overflow pages.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PAGE-001 | When crc32 is called on b"123456789", the system shall return 0xCBF43926. | TEST-PAGE-001 |
| REQ-PAGE-002 | When a cell is inserted into a Page with room, the system shall return its slot id and get(slot) shall return the cell bytes. | TEST-PAGE-002 |
| REQ-PAGE-003 | If a cell does not fit in the free space, then insert shall return PageError::Full and leave the page unchanged. | TEST-PAGE-003 |
| REQ-PAGE-004 | When a cell is deleted, get(slot) shall return None and a later insert shall reuse the freed slot id. | TEST-PAGE-004 |
| REQ-PAGE-005 | When compact is called, the system shall reclaim holes left by deleted cells without changing any live slot id or content. | TEST-PAGE-005 |
| REQ-PAGE-006 | When a page is serialized with to_bytes and read with from_bytes, the system shall yield an identical page. | TEST-PAGE-006 |
| REQ-PAGE-007 | If any single bit of the serialized bytes is flipped, then from_bytes shall return PageError::Corrupt. | TEST-PAGE-007 |
| REQ-PAGE-008 | When free_space is queried, the system shall equal size - header - 4 per slot - sum of live cell lengths after compaction. | TEST-PAGE-008 |
| REQ-PAGE-009 | If the page size is below 12 or above 65535, then Page::try_new shall return Err(PageError::BadSize) instead of panicking. | TEST-PAGE-009 |

## Assumptions / risks
Cell length < 65535; page size <= 65535 (u16 offsets).
