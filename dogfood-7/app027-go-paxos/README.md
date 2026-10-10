# Deterministic Multi-Paxos simulator

Standard-library-only Go module with five packages:

- `net`: virtual-time heap, directed partitions, duplicates and replay traces.
- `quorum`: immutable stable and joint-majority membership.
- `paxos`: durable acceptors, reusable leader ballots, recovery, sequential slots and membership barriers.
- `machine`: JSON-logged register operations, CAS, latest-request deduplication.
- `history`: bounded linearizability search with witnesses, pending calls and an explicit unknown verdict.

Run `go test -race ./...`, `go vet ./...`, or `go run ./spike`.
The integration corpus checks 100 deterministic schedules, 2,000 register operations,
disjoint membership, leader changes, delayed old messages and deliberately corrupted histories.

## Model boundaries

This is a **single-coordinator deterministic simulation**, not a production distributed service.
The coordinator authenticates sender IDs, serializes proposals and membership barriers,
and raises all provisioned nodes' durable promises before returning from finalization.
Crashes retain promises and accepted slots in memory; disk and process-loss durability are out of scope.
Only pre-provisioned nodes may join. A failed operation may have been accepted and recovered;
real clients must treat it as pending and retry the same sequence.
Retries replay only the latest client sequence; older sequences are rejected.
Reads go through consensus. Equal timestamps in histories are concurrent, not ordered.
DFS memoization is explicitly deferred; budget exhaustion is unknown, never a false illegal verdict.

## SDD evidence

From this directory:

```sh
S="node ../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs --root $PWD"
$S plan
$S impact REQ-QUORUM-005
$S gate
```

Specs have independent AI-review locks; evidence includes five initial Red/Green cycles,
two reviewed regression fixes (same-ballot conflicts and tied timestamps), a validation-helper
refactor, a test-only integration characterization, and post-Green spec-lock drift rejection.
`gate --changed` was exercised with both cwd and root at this app. Its known nested-repository
path defect still skips changed evidence/checks here; the full gate and explicit Go checks
are the validation authority. New script findings live in `../findings/app027.md`.
