---
feature: lock
tier: T2
---
# lock
Goal: deterministic lockfile writing, parsing and verification. Non-goals: tarball fetching.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-LOCK-001 | When writeLock(tree, registry, rootDeps) is called, the system shall produce identical text regardless of tree insertion order. | TEST-LOCK-001 |
| REQ-LOCK-002 | The lock shall list packages sorted by name in code-point order. | TEST-LOCK-002 |
| REQ-LOCK-003 | Each entry shall record version, resolved URL, integrity `sha512-<base64 of sha512(name@version)>` and dependencies mapped to the locked versions. | TEST-LOCK-003 |
| REQ-LOCK-004 | The lock text shall use 2-space JSON indent, LF endings and one trailing newline. | TEST-LOCK-004 |
| REQ-LOCK-005 | If the text is malformed JSON, has an unsupported lockfileVersion or a malformed entry, then parseLock shall throw LockError. | TEST-LOCK-005 |
| REQ-LOCK-006 | serializeLock(parseLock(text)) shall equal text for any written lock, and shall canonicalize shuffled key order. | TEST-LOCK-006 |
| REQ-LOCK-007 | When a dependency points to a package not in the lock, verifyLock shall report `dangling`. | TEST-LOCK-007 |
| REQ-LOCK-008 | When a package is not reachable from the root deps, verifyLock shall report `extraneous`. | TEST-LOCK-008 |
| REQ-LOCK-009 | When a locked version does not satisfy a root range, verifyLock shall report `root-mismatch`. | TEST-LOCK-009 |
| REQ-LOCK-010 | When diffLock(a,b) is called, the system shall list added, removed and changed (from→to) packages sorted by name. | TEST-LOCK-010 |
| REQ-LOCK-011 | When an entry's integrity does not match name@version, verifyLock shall report `integrity`. | TEST-LOCK-011 |
| REQ-LOCK-012 | When package names are integer-like (`9`, `10`) or contain astral characters, the lock shall still order keys by code point at every level (bug fix: JS objects reorder integer keys; UTF-16 order differs from code-point order). | TEST-LOCK-012 |

## Design
Components: lock.js, consumes resolver output (Map name→version) + registry metadata; uses range.satisfies.
Lock shape: {lockfileVersion:1, root:{deps}, packages:{name:{version,resolved,integrity,dependencies}}}.

| Issue kind | Condition |
| --- | --- |
| dangling | entry dependency name absent from packages |
| extraneous | package unreachable from root deps via dependencies |
| root-mismatch | root range not satisfied by locked version (or package absent) |
| integrity | integrity != computed |

| Invariant | Rule |
| --- | --- |
| L1 | keys sorted at every level; output bytes are a pure function of content |
| L2 | verifyLock issues sorted by (kind, pkg) |
