---
feature: arena
tier: T2
---
# arena
Goal: block-chained bump allocator with marks, rewind, limit and overflow-safe sizing. Non-goals: thread safety, per-object free.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ARENA-001 | When arena_new(block_size) is called, the system shall return an arena with used=0, one block, and block_size defaulting to 4096 when 0 is passed. | TEST-ARENA-001 |
| REQ-ARENA-002 | When arena_alloc(a,n,align) is called with a power-of-two align, the system shall return a pointer whose address is a multiple of align. | TEST-ARENA-002 |
| REQ-ARENA-003 | If align is 0 or not a power of two, then arena_alloc shall return NULL and set ARENA_ERR_ALIGN without changing arena state. | TEST-ARENA-003 |
| REQ-ARENA-004 | When memory is returned by arena_alloc, the system shall zero-fill it and never overlap it with an earlier live allocation. | TEST-ARENA-004 |
| REQ-ARENA-005 | When the current block cannot fit an allocation, the system shall append a block of max(block_size, n+align) bytes while earlier pointers stay valid. | TEST-ARENA-005 |
| REQ-ARENA-006 | If n+align overflows size_t, then arena_alloc shall return NULL with ARENA_ERR_OVERFLOW and leave state unchanged. | TEST-ARENA-006 |
| REQ-ARENA-007 | When arena_rewind(a,mark) is given a mark from arena_mark, the system shall restore used bytes and release blocks created after the mark. | TEST-ARENA-007 |
| REQ-ARENA-008 | If a mark is newer than the arena state (stale after an earlier rewind), then arena_rewind shall return ARENA_ERR_BADMARK and change nothing. | TEST-ARENA-008 |
| REQ-ARENA-009 | When arena_strndup(a,s,n) is called, the system shall copy at most n bytes of s (stopping at NUL) and NUL-terminate the copy. | TEST-ARENA-009 |
| REQ-ARENA-010 | When arena_set_limit(a,max) is set, the system shall refuse allocations that would make reserved bytes exceed max with ARENA_ERR_LIMIT and keep earlier data. | TEST-ARENA-010 |
| REQ-ARENA-011 | When arena_reset is called, the system shall keep only the first block, set used=0, and arena_free(NULL) shall be a no-op. | TEST-ARENA-011 |

## Design
Components: `arena_t` = singly linked list of `block` {next, cap, used, data[]}; `cur` points to tail block. Data flow: alloc → align inside cur (padding computed from real address) → else new block.
State/invariant table:

| State | Field | Invariant |
| --- | --- | --- |
| block | used <= cap | always; padding counts as used |
| arena | cur->next == NULL | cur is the tail |
| arena | reserved == sum(cap) | updated on block add/free |
| arena | used == sum(block.used) | bytes consumed incl. padding |
| mark | {id, depth} | valid iff depth < stack_len and stack[depth].id == id |
| arena | mark stack | strictly increasing ids; rewind(M) pops every entry above M.depth, M stays valid |
| arena | next_id | monotonic, never reused, so a stale mark can never alias a new one |

Decisions: arena_mark pushes {id, block_index, offset} on a heap array in the arena; arena_reset clears the stack.
Error codes: ARENA_OK=0, ARENA_ERR_ALIGN, ARENA_ERR_OVERFLOW, ARENA_ERR_LIMIT, ARENA_ERR_BADMARK, ARENA_ERR_NOMEM.

## Assumptions / risks
- Alignment from real address (not offset) because malloc block base only guarantees alignof(max_align_t): TEST-ARENA-002 uses align 64.
- Stale mark detection relies on the monotonically increasing mark id: TEST-ARENA-008.
