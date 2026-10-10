# Go observability pipeline

One standard-library-only Go module with trace, tail-sampling, HDR metrics,
logging and pipeline packages; `internal/` contains generic copy and HDR helpers.

```sh
go test -race ./...
go vet ./...
go run ./cmd/observe
node ../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs --root "$PWD" gate
```

`trace` accepts strict lowercase W3C v00 headers and preserves cancellation.
`sampling` groups immutable span values by trace ID, waits for its first-seen
deadline, retains error/slow traces and bounds both traces and spans per trace.
`metrics` implements integer exponent/subbucket HDR histograms with ≤0.1%
relative bucket error, quantiles, immutable snapshots and checked merges.
`logging` trusts correlation only from context, strips spoofed reserved keys,
clones string maps, and rejects full queues without evicting earlier records.
`pipeline` serializes admission, validates cancellation under its mutex, checks
all capacities and emits metrics, spans and correlated logs atomically.

Configuration constructors panic on invalid limits. Pipeline capacity is
1–1,000,000; max span duration is 1e12 ns. Logs are retained for the pipeline
lifetime, so this capacity also bounds total accepted events. Flush frees only
tail-sampling capacity; Close rejects ingestion but permits reading and flushing.
Late spans form a new pending generation; OTLP export is explicitly deferred.

SDD evidence includes a runtime race spike, five initial feature cycles, three
bug-fix cycles, a histogram refactor, spec drift rejection and cross-feature
impact. Tagged contract characterization runs with `-tags=contract`; all SDD
runners include this tag and `-race`. Fractional quantile ranks use exact
rational arithmetic so counts above 2^53 cannot round into another bucket.
Full gates are authoritative: nested repository changed gates have a
known path-scoping defect and can skip all evidence despite using app cwd/root.
