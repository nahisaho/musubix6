---
feature: btree
tier: T2
---
# btree
Goal: in-memory B+tree (arena nodes) with ordered keys, split/merge rebalancing, cursors and page serialization. Non-goals: concurrency.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-BT-001 | When a key is inserted into an empty tree, get(key) shall return its value and len shall be 1. | TEST-BT-001 |
| REQ-BT-002 | When an existing key is inserted again, the system shall replace the value, return the old value and keep len unchanged. | TEST-BT-002 |
| REQ-BT-003 | When more than `order` keys are inserted, the leaf shall split and check_invariants shall hold, including equal leaf depth. | TEST-BT-003 |
| REQ-BT-004 | When 1000 keys are inserted in pseudo-random order, get shall find all of them and the in-order key sequence shall be sorted. | TEST-BT-004 |
| REQ-BT-005 | When a key is removed, the system shall return its value and get shall return None. | TEST-BT-005 |
| REQ-BT-006 | If a removal leaves a node under the minimum fill, then the system shall borrow from a sibling or merge (counted in stats().borrows / stats().merges) and keep all invariants. | TEST-BT-006 |
| REQ-BT-007 | When all keys are removed, the tree shall collapse to a single empty leaf root with height 1. | TEST-BT-007 |
| REQ-BT-008 | When first_ge(k) or last_lt(k) is called, the system shall return the smallest entry >= k or greatest entry < k. | TEST-BT-008 |
| REQ-BT-009 | When to_pages and from_pages are chained, the system shall produce a tree with identical entries. | TEST-BT-009 |
| REQ-BT-010 | If order is below 3, then BTree::new shall return Err(BTreeError::OrderTooSmall). | TEST-BT-010 |
| REQ-BT-011 | When last() is called, the system shall return the greatest entry, or None for an empty tree. | TEST-BT-011 |
| REQ-BT-012 | If a page image holds a child pointer outside the node table or a node that is reachable twice, then from_pages shall return Err(BTreeError::BadPage) instead of panicking. | TEST-BT-012 |
| REQ-BT-013 | If page_size is not a valid page size, then to_pages shall return Err(PageError::BadSize) instead of panicking. | TEST-BT-013 |

## Design
Components: `BTree{nodes: Vec<Node>, free, root, order, len}`; leaves hold keys+vals+next, internals hold separator keys + children; pagefmt `Page` carries serialized nodes.

| Invariant | Rule |
| --- | --- |
| I1 fill | non-root node has `order/2 <= keys <= order`; root leaf may be empty |
| I2 order | keys strictly increasing inside a node |
| I3 separator | internal key[i] > all keys of child[i] and <= all keys of child[i+1] |
| I4 depth | all leaves at the same depth |
| I5 chain | leaf `next` chain visits all entries in ascending order |
| I6 len | `len` equals the number of leaf entries |

Key decisions: separator is copied up for leaves, moved up for internals; deletion fixes underflow on the way back up (borrow-left, borrow-right, merge).

## Assumptions / risks
Merge must fix leaf chain; separator refresh after borrow (bug-prone, covered by TEST-BT-006 and fuzz TEST-BT-004).
