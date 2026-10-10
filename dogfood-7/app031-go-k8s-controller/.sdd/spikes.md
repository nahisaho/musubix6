# Runtime spikes

- Go 1.26: `go test ./... -run '^$'` compiles generic stores/queues inside `internal/`, embedded metadata, fake clocks, interfaces and table subtests. Initial throwing skeletons compiled, so Reds did not depend on compiler failures.
- Lease expiry uses the fake clock and inclusive expiry boundaries, never sleep. `TEST-LEADER-002` proves renew-before-expiry and failover-at-expiry.
- `go test -race -count=1 ./...` checks the root packages; the same command in `simulator/` checks the second module and actual fenced API transactions.
- `go run -race . -resources 40 -workers 8` inside `simulator/` converged: 80 reconciles, 40 cleanups, zero remaining objects.
- Known nested-root changed-scope defect reproduced even with cwd and `--root` both set to the app directory. No changed-scope PASS is relied on: all project checks are executed by the full gate.
