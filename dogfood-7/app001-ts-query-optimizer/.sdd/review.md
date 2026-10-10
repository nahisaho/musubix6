# Independent review log
Scope: this app's new specs and implementation only; no other apps or skill changes.

| id | sev | path:line | state |
| --- | --- | --- | --- |
| SPEC-01 NULL truth tables missing | high | .sdd/specs/algebra.md:24 | Resolved |
| SPEC-02 statistics domain unspecified | high | .sdd/specs/statistics.md:23 | Resolved |
| SPEC-03 fixed point versus cycle | med | .sdd/specs/rules.md:20 | Resolved |
| COR-01 singleton boolean scalar normalization | high | packages/optimizer/src/rules.ts:17 | Fixed |
| CON-01 explicit nullFraction null | med | packages/optimizer/src/stats.ts:18 | Fixed |
| NUM-01 premature intermediate saturation | high | packages/optimizer/src/stats.ts:68 | Fixed |
| NUM-02 combined selectivity underflow | med | packages/optimizer/src/stats.ts:81 | Fixed |
| NUM-03 positive subnormal quantization | med | packages/optimizer/src/stats.ts:75 | Fixed |
| CON-02 inherited table and row values | med | packages/algebra/src/index.ts:155 | Fixed |
| CON-03 inherited statistics values | med | packages/optimizer/src/stats.ts:31 | Fixed |

Reviewers: spec-contract-review, spec-delta-review, correctness-review,
test-contract-review, numeric-spec-review and own-properties-spec-review.
Revisions add complete NULL tables and explicit numeric domains. Seven
implementation findings have assertion-proven Red/Green regression cycles.
Clean numeric delta rounds: delta-clean-round-one and delta-clean-round-two.
Clean reserved-name delta rounds: own-properties-clean-one and
own-properties-clean-two. No Open findings remain.
TEST-STAT-012's final refactor changed only an erasable Plan type annotation;
its assertions are identical to the proven failing Red.
Final checks: 48 traced REQs, 52 passing tests, typecheck, runtime spike, CLI
stdin/file/error modes, seeded row-bag differential tests and a ten-relation
DP frontier (57,002 candidates, optimal cost 190). No commits/pushes or skill
changes were made. Changed-gate output is not relied on because F1 reproduces
its nested-root scope defect; the final full gate checks all three packages.
