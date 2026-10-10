# PostgreSQL-wire-lite (Go)

An actual loopback protocol-v3 server with no third-party dependencies.

```sh
go run ./cmd/sqlwire -port 55432
# In another terminal, with psql already installed:
psql 'host=127.0.0.1 port=55432 user=demo dbname=demo sslmode=disable' \
  -c "SELECT 42, 'hello', NULL"
go test -race ./...
go vet ./...
```

Only explicitly configured `demo` is authorized. This is **local trust**, not
password authentication: never expose this demonstration server to a network.
SSL is declined, authentication credentials are not accepted, and the command
binds exclusively to 127.0.0.1. Connections have a five-minute deadline and the
listener admits at most 64 simultaneous connections.

## Supported protocol

Startup/SSL negotiation, AuthenticationOk, ParameterStatus, BackendKeyData,
ReadyForQuery; simple Query; Parse, Bind, Describe, Execute, Close, Flush, Sync,
and Terminate. Text parameters/results only. Frames are capped at 1 MiB;
statements/portals/columns/parameters at 128, series at 10,000 rows. Outgoing
DataRows are checked against the same frame bound before encoding. Parse
accepts only unspecified or text (25) parameter OIDs.

SQL: `SELECT` integer/text/NULL literals and `$n` parameters, plus
`SELECT generate_series(lo, hi)`. `BEGIN`, `COMMIT`, and `ROLLBACK` are handled
by simple Query. There are no tables, writes, persistence, COPY, savepoints,
binary formats, or cancellation. A backend key is advertised for handshake
compatibility only; cancel requests are deliberately unsupported.

Transaction states are I (idle), T (active), E (failed). A failed transaction
rejects queries until rollback, or COMMIT reports ROLLBACK. Extended-protocol
errors ignore messages until Sync, except Terminate. Sync clears protocol
recovery but does not clear E. Unlike full PostgreSQL, portals explicitly
survive transaction boundaries/Sync until Close or disconnect; statements also
survive. Closed statements do not invalidate already-bound portals.

## Verification artifacts

Five T2 specs contain 56 total REQs (55 active, one cancellation REQ deferred).
Thirty annotated tests cover fragmented reads/writes, all transaction
policy cells, prepared resources, portal suspension, startup policy, genuine
`net.Conn` transport, parallel isolation, and five regression fixes. A separate
stress-tagged codec test covers all 256 message tags and uses a generic helper.

`.sdd/` stores the plan, spec locks, Red→Green/refactor ledger, logs and impact
probes. One explicit `--retest` corrected the io.ReadFull truncation oracle;
the gate reports its weak Red honestly. Always use the full gate: the known
nested-root `gate --changed` defect selects zero tests even from this cwd.
An embedded-role mutation confirmed an already-reported impact false negative;
the mutation was restored and the final full suite is clean.
