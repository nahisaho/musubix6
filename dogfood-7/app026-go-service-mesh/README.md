# Go service mesh control-plane simulator

Five packages implement 55 requirements with deterministic millisecond time:

- Root `mesh`: validated endpoint contracts and deep-copy snapshots.
- `control`: version/nonce-based capacity-one xDS subscriptions, ACK/NACK and last-write-wins delivery.
- `balance`: round robin, integer weighted rotation, least request, and rendezvous hashing.
- `circuit`: admission capacity, closed/open/half-open generations and idempotent completion.
- `proxy`: bounded idempotent retries, deadlines, consecutive-failure ejection and overflow-safe time.

```sh
go run ./cmd/mesh
go test -race ./...
go vet ./...
node ../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs --root "$PWD" gate
```

The demo publishes and ACKs a snapshot, retries a failing east endpoint, ejects it, and routes to west.
No external dependencies, background services, credentials, actual network operations, or wall-clock sleeps are needed.
Callbacks run outside locks; each request starts at caller-supplied time, transport consumes zero simulated time,
and retries advance only that request's clock. Caller time is nondecreasing. Deadline equality rejects attempts.
Each completion handle must be called once; circuit completion handles are safe to call repeatedly.

Workflow evidence lives in `.sdd/`: five T2 locks, plan, review, Red/Green ledger, five regression cycles,
and a behavior-preserving proxy bookkeeping refactor. Known nested-root changed-gate skipping is not accepted
as validation; the full gate and race suite are authoritative.
