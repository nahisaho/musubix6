---
feature: codec
tier: T2
approval: auto
---
# codec
Goal: Avro-like codec; non-goals: Apache Avro wire interoperability, named references, persistence.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CODEC-001 | When using codec, the system shall round-trip schema-valid records through generated codecs. | TEST-CODEC-001 |
| REQ-CODEC-002 | When using codec, the system shall reject invalid datum before encoding. | TEST-CODEC-002 |
| REQ-CODEC-003 | When using codec, the system shall reject malformed envelopes and mismatched schema fingerprints. | TEST-CODEC-003 |
| REQ-CODEC-004 | When using codec, the system shall round-trip bytes and container values losslessly. | TEST-CODEC-004 |
| REQ-CODEC-005 | When using codec, the system shall apply isolated record defaults without mutating input. | TEST-CODEC-005 |
| REQ-CODEC-006 | When using codec, the system shall resolve reader schemas using aliases defaults and numeric promotions. | TEST-CODEC-006 |
| REQ-CODEC-007 | When using codec, the system shall preserve null and union branch values. | TEST-CODEC-007 |
| REQ-CODEC-008 | When using codec, the system shall reject tampered decoded datum and unknown envelope fields. | TEST-CODEC-008 |
| REQ-CODEC-009 | If an array datum contains missing indices, the system shall reject encoding before producing an envelope. | TEST-CODEC-009 |
| REQ-CODEC-010 | If a union envelope datum is invalid for its explicitly tagged writer branch, the system shall reject decoding at every nesting level. | TEST-CODEC-010 |
## Design
Schema AST flows through validation, compatibility, registry, codec and migration workspaces.
Pure recursive resolution; synchronous atomic in-memory registry; JSON fingerprint envelope, not Avro binary.
Writer unions select the first datum-valid branch and encode its index; readers select the first compatible branch.
## Assumptions / risks
Node 24 executes erasable TypeScript directly; spike verifies TS imports and byte round trips.
No remote IO or destructive operations. Depth is bounded at 64; union defaults use first branch.
Record names and aliases use simple identifiers; int/long use safe JS numbers.
