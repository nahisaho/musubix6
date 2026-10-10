# Kubernetes-style controller runtime

A dependency-free Go 1.26 runtime with two modules (`.` and `simulator/`), not a client for a live Kubernetes cluster.

- Generic informer cache: copy isolation, sorted relists, version watermarks, snapshot event barriers and deletion tombstones.
- Generic work queue: FIFO deduplication, dirty/processing states, deterministic delayed retries, capped exponential backoff and cancellation.
- Lease election: injected clocks, inclusive expiry, increasing fencing tokens and atomic fenced storage transactions.
- Finalizers: register once, preserve unrelated ownership, retry failed cleanup, copy-on-write transformations.
- Reconciliation: leader-gated workers, retry errors, optimistic resource versions, no-op status suppression, fenced writes and informer feedback.

```sh
go test -race -count=1 ./...
go test -race -tags=sddprobe ./spikes
go vet ./...
cd simulator
go test -race -count=1 ./...
go run -race . -resources 40 -workers 8
```

The simulation creates resources, registers finalizers, deliberately fails each first reconcile, retries to `ready`, requests deletion and runs cleanup before removing resources. Output is JSON counters; the final `remaining` count must be zero. No real cluster resources are created/deleted.

Configure callbacks and controller identity before starting workers. Cleanup must be idempotent. A writer must validate resource versions and fencing atomically; `MemoryAPI` does so under `Elector.WithFence`. Trusted transaction bodies may not reenter the elector; event callbacks run outside transaction locks.

SDD evidence lives in `.sdd/`: five T2 specifications, 51 requirements, independent reviews, 20 annotated tests, two initial regression fixes, a no-op regression fix, a review-driven snapshot regression, and an exponential-backoff refactor. `simulator/` is explicitly configured as a dependent project.

Run the full gate from this directory:

```sh
node ../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs --root "$PWD" gate
```

The known nested-root changed-scope issue can print `0/0` evidence and skip all checks even with this cwd/`--root`; do not use that output as verification. Full gates and direct race/vet runs provide the evidence here.
