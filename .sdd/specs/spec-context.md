---
feature: spec-context
tier: T2
approval: auto
---
Goal: reduce AI input by selecting authoritative specifications; never narrow validation. Non-goals: semantic search, persistent caches, delta delivery, release/publish. Oracle: the five requirements below; fixtures define exact sets and independent crypto/Buffer byte counts, not implementation-derived selection.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SPECCTX-001 | When context receives one or more feature names, REQ IDs, spec paths or existing file paths, or --changed, the system shall select complete owning specs and file-impact specs, deduplicate and sort them, and reject every unresolved selector without emitting spec bodies (exit 2). | TEST-SPECCTX-001 |
| REQ-SPECCTX-002 | When specs are selected, the system shall recursively include plan.md prerequisites and declared artifacts, and reject malformed plans, cycles, missing prerequisites/artifacts, duplicate feature/REQ definitions and paths outside the root (including symlinks), with exit 2 and no spec bodies. | TEST-SPECCTX-002 |
| REQ-SPECCTX-003 | When rendering context, the system shall measure the entire UTF-8 stdout payload against --max-bytes (positive safe integer; default 16384), accept equality, and on excess emit no bodies, exit 2 and report required bytes and a bounded feature-size index; Markdown and --json shall have identical selection. | TEST-SPECCTX-003 |
| REQ-SPECCTX-004 | When context runs, the system shall read current files without persistent writes, expose SHA-256 for each included file and total/selected spec counts, and label output as reading context, not validation or approval evidence. | TEST-SPECCTX-004 |
| REQ-SPECCTX-005 | When developing with bundled SDD skills, the agent shall use context before reading specs, explicitly resolve selection/size failures, preserve full validation, and access the command through both sdd.mjs and musubix6 sdd. | TEST-SPECCTX-005 |
## PASS conditions and counterexamples
| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-SPECCTX-001` | calc selects calc plus import consumers for file inputs, never unrelated | mixed calc/missing and feature-vs-REQ ambiguity must exit 2 without bodies; no Git/clean --changed is not success | TEST-SPECCTX-001 | S tdd red/green: assertion Red then Green; impact-closure and ambiguous-selector mutations detected; accidental duplicate-heading control corrected before final assertion Red |
| `REQ-SPECCTX-002` | app -> base -> core includes all 3 once | app -> absent, a -> b -> a, non-table plan, duplicate IDs and escaped artifacts must fail | TEST-SPECCTX-002 | S tdd red/green: assertion Red then Green; prerequisite, symlink and malformed-plan mutations detected |
| `REQ-SPECCTX-003` | N-byte output succeeds at N and fails at N-1 | Japanese UTF-8 counted as bytes, invalid/zero/unsafe limit rejected, no partial body | TEST-SPECCTX-003 | S tdd red/green: assertion Red then Green; equality, UTF-8 and bypass mutations detected |
| `REQ-SPECCTX-004` | same input yields same output; edit changes hash immediately | stale cache, writes to .sdd, or reporting PASS must fail | TEST-SPECCTX-004 | S tdd red/green: assertion Red then Green; hash mutation detected |
| `REQ-SPECCTX-005` | wrapper and direct CLI produce same bytes; skill instructions preserve full gate | dropped wrapper args or instructions to skip global verification must fail | TEST-SPECCTX-005 | S tdd red/green: assertion Red then Green; direct/wrapper/installed copies agree; npm pack --dry-run includes module/tests |
Risk stages: contract=whole-file closure; trusted inputs=selectors/plan/path ambiguity; execution=UTF-8 bounds and deterministic ordering; verdict=never PASS evidence; history=no cached context or approval writes; integration=wrapper/installed skills/full gate unaffected.
## Design
Reuse loadSpecs/loadPlan, changedFiles and impactOne's result via lazily loaded scripts/spec-context.mjs; selection is separate from trace/gate/approval, with no context cache or external service.
Resolve exact case-sensitive feature/REQ/spec-path matches; reject feature/path ambiguity. Canonical realpath containment applies to every file relative to --root (default cwd); normalize separators; file inputs reuse impact, then close over plan dependencies/artifacts. Unowned/deleted changed files, no Git, empty selection, malformed/duplicate plan rows, and cycles fail closed; no partial selection. File-impact output explicitly warns about static-analysis limits.
One in-memory payload carries sorted paths, hashes and full text; serialize once, check exact bytes before stdout; failures list at most 10 features (120-character labels) plus an omitted count, never spec bodies.
## Assumptions / risks
No implicit semantic relationships: only existing impact edges and declared plan prerequisites are knowable; tests cover annotated JS imports and explicit dependencies, not every supported language. S = node .github/skills/lean-sdd-tdd/scripts/sdd.mjs; ran S tdd red/green for all five TEST IDs above; node --test scripts/spec-context.test.mjs (from the skill directory): 5/5; 9 isolated mutations detected, restored 5/5; 58 targeted existing regressions pass with no skips.
Spike: real REQ/file impact JSON works without Git; Japanese 3 chars = 9 UTF-8 bytes. Synthetic 100-spec fixture: 106560 source bytes -> 1527 output bytes (98.57% fewer bytes, not measured tokens/cost); default budget does not bound local scanning/memory.
S gate --changed: FAIL, 22 pre-existing trace errors and two missing locks; isolated HEAD gate confirms same blockers. No full/native matrix or release qualification performed; no release/publish authorized. Japanese prose diagnostic: score 99, pre-existing finding only; structural lint has pre-existing findings only.
