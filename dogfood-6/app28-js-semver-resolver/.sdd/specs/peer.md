---
feature: peer
tier: T2
---
# peer
Goal: model peer dependencies (required/optional) and validate a resolved tree. Non-goals: auto-install (resolver feature).

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PEER-001 | When peerRequirements(meta) is called, the system shall split peerDeps into required and optional using peerMeta[name].optional. | TEST-PEER-001 |
| REQ-PEER-002 | When a package has no peerDeps, peerRequirements shall return empty required and optional maps. | TEST-PEER-002 |
| REQ-PEER-003 | When a required peer is absent from the tree, checkPeers shall report kind `missing`. | TEST-PEER-003 |
| REQ-PEER-004 | When a peer is present with a version outside its range, checkPeers shall report kind `mismatch` with the actual version. | TEST-PEER-004 |
| REQ-PEER-005 | When an optional peer is absent, checkPeers shall report nothing for it. | TEST-PEER-005 |
| REQ-PEER-006 | When an optional peer is present but outside its range, checkPeers shall report `mismatch`. | TEST-PEER-006 |
| REQ-PEER-007 | When a peer range is a union (`^15 || ^16`), the peer shall be satisfied if any alternative matches. | TEST-PEER-007 |
| REQ-PEER-008 | checkPeers shall return violations sorted by (pkg, peer) and independent of tree insertion order. | TEST-PEER-008 |
| REQ-PEER-009 | When formatViolation(v) is called, the system shall render a one-line message naming pkg, peer, range and actual/missing. | TEST-PEER-009 |

## Design
Components: peer.js pure functions over tree Map(name→version) and registry {name:{version:meta}}.
Meta shape: {deps, peerDeps, peerMeta}. Violation: {pkg, version, peer, range, kind: missing|mismatch, actual?}.

| Peer state | In tree? | In range? | Optional | Result |
| --- | --- | --- | --- | --- |
| absent | no | - | no | missing |
| absent | no | - | yes | none |
| present | yes | yes | any | none |
| present | yes | no | any | mismatch |

Decision: prerelease actual versions follow range.satisfies rule.
