---
feature: safety
tier: T2
approval: auto
---
# Safety and API
Goal: Deterministic limits, matching APIs and independently reusable compiled patterns.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SAFETY-001 | When VM work exceeds the positive step limit, execution shall raise StepLimitError. | TEST-SAFETY-001 |
| REQ-SAFETY-002 | When NFA work exceeds the step limit, execution shall raise StepLimitError. | TEST-SAFETY-001 |
| REQ-SAFETY-003 | When search scans starting positions, it shall use one shared budget and return the leftmost match. | TEST-SAFETY-002 |
| REQ-SAFETY-004 | When match runs at pos, it shall require a match beginning at that position. | TEST-SAFETY-002 |
| REQ-SAFETY-005 | When finditer yields empty matches, it shall advance one codepoint and terminate. | TEST-SAFETY-003 |
| REQ-SAFETY-006 | When finditer yields matches, it shall preserve nonoverlapping spans and one shared budget. | TEST-SAFETY-003 |
| REQ-SAFETY-007 | When one compiled pattern is reused concurrently, captures and budgets shall be isolated per call. | TEST-SAFETY-004 |
| REQ-SAFETY-008 | If limits or positions are invalid, the API shall reject them with ValueError. | TEST-SAFETY-004 |
| REQ-SAFETY-009 | When syntax-only diagnostic examples run, their observed contract shall remain stable. (test-only) | TEST-SAFETY-005 |
| REQ-SAFETY-010 (deferred) | When streaming input arrives, the engine shall resume incremental matching. | — |
| REQ-SAFETY-011 | If compilation allocates more than 10000 NFA states, the compiler shall raise ValueError without expanding the remaining graph. | TEST-SAFETY-006 |
| REQ-SAFETY-012 | If pattern length exceeds 4096, nesting exceeds 100, or input length exceeds 512, the API shall raise ValueError before recursive evaluation. | TEST-SAFETY-006 |
| REQ-SAFETY-013 | When flat sequences or required nullable repetitions within limits run, execution shall not depend on the Python call-stack limit. | TEST-SAFETY-007 |
## Design
Budget is a per-operation mutable counter passed through every transition and nested query.
Compiled patterns hold immutable AST/NFA. Match wrappers retain immutable capture spans. Allocation is capped at 10000 states.
## Assumptions
Step limit defaults to 100000; input/codepoint length is not a wall-clock timeout.
Parser nesting at most 100 protects recursion; input length at most 512 protects VM recursion.
