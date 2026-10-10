# Container runtime simulator

Go 1.26, standard library only. No real processes, kernel cgroups, host mounts,
or root privileges. This is a deterministic simulator, not an OCI-compatible
production runtime.

```sh
go run ./cmd/runtimesim -spec examples/container.json
go test -race -count=1 ./...
go vet ./...
node ../../.github/skills/lean-sdd-tdd/scripts/sdd.mjs --root "$PWD" gate
```

The CLI parses a strict simplified OCI JSON document, creates a two-layer
filesystem, starts and charges a container, pauses/checkpoints it, restores and
resumes it, and stops it. JSON output reports the resulting state, files,
resource usage and checkpoint size.

Packages: `internal/oci` validates the input boundary; `overlay` implements
copy-on-read/write and whiteouts; `cgroup` implements atomic int64 accounting;
`engine` serializes lifecycle actions; `checkpoint` validates versioned JSON
and restores independent objects. Zero limits mean unlimited. Paths must be
absolute POSIX paths without `..` or NUL. Checkpoint callers must be quiescent;
exported container and filesystem fields must not be mutated concurrently.

Five T2 specs contain 40 requirements. Seven annotated test functions contain
table/subtest cases, including all 30 state/action combinations. The ledger
records initial Red→Green, two bug fixes (blank executable and inactive usage),
a resource-accounting refactor, and a ledger re-chain. Spec changes after Green
were rejected until re-approval/evidence refresh. The runtime spike verified
trailing-JSON detection and mutex-enforced capacity using `go run -race spike.go`.

Reviews were local and explicitly identified as such: independent nested
review delegation was unavailable to this assigned agent. No human approval,
release, kernel policy change, or irreversible action was performed.

`gate --changed` was exercised with both cwd and `--root` set to this app,
but the already-reported nested-root defect skipped its checks/evidence.
Only the final **full gate**, which runs uncached race tests and vet, is used
as completion evidence. New Go findings are in `../findings/app028.md`.
