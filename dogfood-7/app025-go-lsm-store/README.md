# Go LSM KV store

Five Go packages implement a persistent, single-process MVCC key/value store:
`memtable`, `sstable`, `wal`, `store`, and `compact`.

```go
db, err := store.Open("./data") // caller must check err
defer db.Close()
_, err = db.Put("key", []byte("old"))
snapshot := db.Snapshot()
_, err = db.Put("key", []byte("new"))
old, present := db.Get("key", snapshot) // "old", true
err = db.Flush()
err = compact.Run(db) // preserves both versions
iterator := db.Iterate("", "", snapshot)
for iterator.Next() {
    record := iterator.Record()
    // record.Key and record.Value are detached from the store.
}
```

Point reads use each SST's bloom filter and sorted version lookup. Iterators
materialize sorted, deduplicated visible records and remain unchanged by later
writes. Range start is inclusive; end is exclusive; empty end is unbounded.
Snapshots are immutable sequence cutoffs. Deletes are versions with tombstones.
Only successful synced WAL appends advance the sequence. Reopening repairs
incomplete tails and derives the next sequence from all recovered records.
Write or sync failures poison a WAL handle until close/reopen, preventing
acknowledging later writes on an unrecoverable partial frame. A failed append
has uncertain persistence and may replay after reopening. Record keys and values
are base64 encoded, preserving arbitrary bytes including invalid UTF-8.
The manifest is atomically published after SST contents and directory entries
are synced. Corrupt complete WAL frames and corrupted SST envelopes are errors.

Size-tiered selection groups tables within a 2x size ratio and minimum fan-in.
Leveled selection includes the chosen level and overlapping next-level ranges.
`compact.Merge` provides sorted version-preserving merging; `compact.Run`
executes full database compaction. Policy selection returns metadata for a
caller-managed scheduler rather than starting background jobs.

## Scope and limits

One process exclusively owns a directory. No multiprocess locks, transactions,
remote replication, automatic flush threshold, or snapshot garbage collection.
All versions and old on-disk tables/WAL frames are deliberately retained:
compaction reduces active tables, not total disk usage. SST records are loaded
into memory; filters are deterministically reconstructed on opening. WAL frames
are limited to 16 MiB. Reads after close inspect retained in-memory state; writes
and publication after close return errors. Snapshot sequence values must come
from this database; arbitrary cutoffs are useful for tests but are not validated.
This is a dogfood application, not a production database.

## Checks and SDD evidence

From this directory:

```sh
mkdir -p .runtime
TMPDIR="$PWD/.runtime" go test -race -count=1 ./...
sh sdd.sh gate
sh sdd.sh plan
sh sdd.sh impact REQ-MEM-001 --json
```

45 requirements: 44 active, one explicitly deferred replication requirement.
47 annotated tests include the generated-then-implemented Go `Count` stub.
Five T2 specs, independent spec reviews, filesystem spike, 40 initial feature
Red/Green pairs, four assertion-driven bug fixes (tail repair, recovery sequences,
poisoned WAL handles, binary key persistence), and a comparator
refactor are retained in `.sdd/`. `gofmt`-only test changes were reverified with
`tdd refactor`; no assertions were weakened. A post-Green wording edit exercised
stale-lock/evidence rejection and subsequent re-lock/refactor.
The original sequence uniqueness oracle was strengthened to two nonoverlapping
concurrent waves after contract review; its passing `--retest` Red is explicitly
weak and reported as such in the final gate, not claimed as a failing Red.

`gate --changed` was exercised with both cwd and `--root` set to this directory.
The already-known enclosing-repository path bug still selects 0/0 evidence
and skips the scoped test check here. Do not treat that PASS as validation:
the mandatory full gate runs all race-enabled tests and `go vet`.
New impact defects and standalone fixtures are recorded in
`../findings/app025.md`; they are not patched in the skill.
