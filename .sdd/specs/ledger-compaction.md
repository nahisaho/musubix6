---
feature: ledger-compaction
tier: T2
approval: auto
---
| ID | EARS requirement | Test |
|---|---|---|
| REQ-LEDGER-001 | When reading a legacy or archived ledger, the CLI shall reconstruct the same ordered event bytes and preserve every event's sequence, predecessor, hash and approval/evidence identity. | TEST-LEDGER-001 |
| REQ-LEDGER-002 | When a successful append would exceed 2097152 active UTF-8 bytes, the CLI shall automatically archive complete past events with gzip and retain at most 2097152 active bytes; a single oversized event shall be archived intact; explicit tdd compact and its read-only --dry-run shall use the same policy. | TEST-LEDGER-002 |
| REQ-LEDGER-003 | If required storage is absent, malformed, corrupt, unsafe or inconsistent, or a foreign writer/recovery state is active, the CLI shall refuse evidence validation without substituting an empty ledger or successful default or accepting a mixed read snapshot. | TEST-LEDGER-003 TEST-LEDGER-004 |
| REQ-LEDGER-004 | While appending, compacting or recovering, the CLI shall serialize writers without stealing a live owner's lock; interrupted rotation shall recover the exact pre- or committed post-state without event loss or duplication before another mutation. | TEST-LEDGER-004 |
| REQ-LEDGER-005 | When checking baseline retention, approvals, TDD, planning receipts or merging ledger branches, the CLI shall evaluate the full logical ledger from both the working tree and selected Git baseline, retain existing deletion/rewriting rejection and preserve plain-ledger behavior. | TEST-LEDGER-005 |
| REQ-LEDGER-006 | When distributed through source, npm or either supported host, the archive-aware CLI and its required files shall support Node 20/22/24; existing projects shall require no manual conversion and help shall explain automatic archival and recovery. | TEST-LEDGER-006 |
## Design
One storage adapter owns legacy reads, strict gzip segments, a versioned manifest, active-tail writes and recoverable rotation; native verdict and approval rules remain in sdd.mjs.
Expose the same strict, read-only logical-byte reconstruction as an SDK module
export for repository release tooling. Importing the SDK must not dispatch CLI
arguments, terminate the importer or change process.exitCode. Direct invocation,
including an existing symlink to the SDK with --preserve-symlinks-main, retains
CLI behavior and resolves all six dynamic planning/context/diagnostics imports
and native provenance paths against the actual SDK location. Controls cover
both planning disabled and enabled with a genuinely missing required plan. The adapter
remains inline; standalone SDK copies gain no external import dependency.
Release-tool catalogue digests, receipt-event membership, retained-history prefix
checks and no-change digests use full logical bytes. State snapshots additionally
include the manifest and every archive file. Appends may change the manifest
and tail, but must retain old logical bytes and immutable old archive files.
The unchanged-state comparison excludes exactly the mutable plan, active tail
and manifest; it still compares every old archive file. A no-change adapter
records equal full-logical digests and physical ledger states before and after
the gate, binds them to its real fixture root and independently rechecks the
current state when admitting evidence. The fixture root must also equal
`unchanged` under the caller's expected adapter-output directory; replaying both
the reported root and receipt cwd from another equal-content fixture refuses.
Added, deleted or swapped storage cannot
inherit a prior successful no-change result even when logical bytes are equal.
Once the full gate has completed, its captured after-state is pinned exactly:
the earlier append-time tail/manifest exemption does not permit later edits.
This changes development adapters only: frozen release artifacts and matrix
policy remain unchanged and no qualification or publication is authorized.
Keep this adapter inside the existing standalone sdd.mjs entry point, rather
than introducing a mandatory external import that breaks instrumented standalone
SDK copies. Remove the unreferenced throwing module stub. Both installed hosts
therefore receive the same adapter with their existing script distribution.
Use bounded reads: metadata at most1048576 bytes and a complete logical ledger
at most67108864 bytes per operation, including decompression; exceedance is
unresolved evidence (exit2), never truncation or a partial successful ledger.
These are explicit storage limits, not claims that archival bounds total history
or removes the existing Git/native capture budgets.
Dead-owner reclamation first acquires an exclusive claim inside the still-present
lock directory, then rechecks its unchanged owner and local absent PID before
removing only the known owner/claim files and the empty directory. Ambiguous
interrupted claims refuse; a live lock is never replaced by renaming its directory.
Serialize lock-directory acquisition, reclamation and release with a short-lived
exclusive sibling transition claim (`tdd-transition.lock`), also bound to
host/PID/nonce. Every writer acquires it before looking at or changing tdd.lock,
then releases it before normal ledger work. This prevents a paused reclaimer
from placing its claim in a successor writer's new directory. Readers refuse
an active transition. An interrupted or unknown transition claim is never
automatically deleted; it requires manual investigation, like an interrupted
owner initialization. This trades bounded availability for safe ownership.
Stage complete replacement tail, manifest and compressed blobs and fsync them
before publishing a durable journal. Publish immutable blobs only after the
journal. Recovery accepts old-tail/old-manifest, new-tail/old-manifest or
new-tail/new-manifest states with every staged/published digest verified; an
old-tail/new-manifest mismatch refuses unless both tail identities coincide.
Readers never recover. Writer-owned recovery completes before normal evaluation.
Immutable segments bind compressed/uncompressed SHA-256, byte length, count and boundary event identities. Reassembly verifies ordering, integrity and the original chain; archives remain available locally, never fetched implicitly. Missing/malformed/unresolved storage exits 2; conclusive integrity/baseline mismatches exit 1. Readers refuse an occupied foreign lock or recovery state and recheck snapshot identity before accepting a read.
State table: legacy/archived -> locked preparation -> durable recovery record -> storage switch -> committed; prepare failure preserves old state; recovery-record states refuse read-only evidence and allow validated locked recovery; unknown/corrupt states refuse. Mutating entry points recover before normal evaluation; compact --dry-run is read-only, repeat compaction is idempotent and unknown options refuse with 2. A single oversized row is archived intact, never split.
Replace mtime-only lock stealing: owner binds local host, PID and nonce; live, malformed, foreign-host or unknown owners are never stolen; only a proven absent local owner permits recovery. Durable staging/recovery covers multi-file switches. Merge reconstructs the full stream and may create new immutable segments for its existing re-chained output; it never rewrites an existing segment. Compaction never re-chains.
## PASS conditions and counterexamples
| REQ | PASS condition | Counterexample | TEST/command | Observed evidence |
|---|---|---|---|---|
| `REQ-LEDGER-001` | Three synthetic approval rows reconstruct byte-for-byte; native Red/Green planning proof retains its original identities across archival. | Omit, reorder or reserialize an archived row. | TEST-LEDGER-001, TEST-LEDGER-005, TEST-LEDGER-012; tdd check | Genuine assertion Red/Green retained; current native refactors PASS; all three Linux Node majors pass exact-byte and native-proof controls. |
| `REQ-LEDGER-002` | Small append remains plain; append above 2097152 bytes rotates automatically; compact repeats without changes; dry-run changes no files. | Require manual maintenance, split a UTF-8 row, or write during dry-run. | TEST-LEDGER-002 | Current native refactor PASS; threshold-disabled and dry-run-write mutants assertion-detected, each restored PASS. |
| `REQ-LEDGER-003` | Intact archive passes; missing archive/tail/manifest, one-bit corruption, traversal, symlink escape, duplicate segment and unknown schema refuse. | Treat an unavailable segment as empty and accept later Green. | TEST-LEDGER-003 | Current native refactor PASS; eight declared invalid descriptor/blob rows plus missing storage, symlink and writer controls pass; assembly-bypass mutant detected and restored. |
| `REQ-LEDGER-004` | Every declared rotation boundary recovers a coherent event stream; two writers retain both events; live/unknown/malformed/foreign-host owners are not stolen regardless of age. | Crash between tail and manifest switch, expire a live writer, or accept a foreign in-progress read snapshot. | TEST-LEDGER-004 | Current native refactor PASS; five declared rename-boundary interruptions recover exact bytes and concurrent append retains both events. Archive-link crash and real Windows boundaries remain unrun. |
| `REQ-LEDGER-004` | Recovery succeeds when the old and new manifest bytes coincide but the journal still requires a different active tail. | Treat an equal manifest as proof that the tail was already switched and reject the coherent old-tail state. | TEST-LEDGER-007 | Genuine Red/Green and current native refactor PASS; removing the old-manifest exemption is assertion-detected, restored PASS. |
| `REQ-LEDGER-004` | Two concurrent dead-owner reclaimers both append successfully, even when one pauses after reading the dead owner and a successor attempts to acquire. | A resumes in a replacement live lock, leaves its claim behind and makes the successor fail ENOTEMPTY during release. | TEST-LEDGER-008 | Genuine native assertion Red/Green and current native refactor PASS; bypassing the serialized transition is detected, restored PASS. |
| `REQ-LEDGER-005` | All four plain/archived working-tree and baseline combinations yield equal native/approval/receipt verdicts; deletion fails; merge across a sealed boundary preserves both branches. | Read only the active baseline tail, re-chain truncated history or retain only the latest Green. | TEST-LEDGER-005 | All four combinations and genuine native refactor PASS; three identical event identities reduced to two reject; disabling multiset decrement is assertion-detected, restored PASS. Corrupt Git-baseline fixtures remain unrun. |
| `REQ-LEDGER-005`, `REQ-LEDGER-006` | Importing the SDK leaves the importer alive with exitCode unchanged, and its read-only export returns identical complete bytes for plain and archived fixtures; corrupt or locked storage refuses without writes; direct and symlink invocations dispatch, including planning with --preserve-symlinks-main. | CLI dispatch terminates an importer, preserved symlinks silently exit or resolve planning beside the link, an export returns the empty active tail, or corruption becomes successful empty evidence. | TEST-LEDGER-010 | Renewed native Red-03 fails the intended preserved-symlink assertion before correction; native Green/refactor PASS. Import-dispatch, canonical-location, tail-only-export and reader-guard mutants detected and restored. |
| `REQ-LEDGER-005` | The release-tool gate catalogue reports the full logical byte count and SHA for both plain and archived history, with the same digest before/after compaction; corruption refuses. | Rotate three rows to an archive and obtain zero bytes or the empty-tail SHA in the release catalogue. | TEST-LEDGER-011 | Genuine native assertion Red/Green and current refactor PASS; isolated tail-only catalogue mutant detected, restored PASS. |
| `REQ-LEDGER-005` | A real fresh-root parent/child planning adapter accepts archived old proof and rotation during a native append, preserving the original logical prefix and old blobs; changing an archived receipt witness or deleting an old blob rejects evidence. | Native receipt hashes exist only in gzip, or an append replaces the manifest and moves the prefix from tail to archive: tail-only membership/prefix or immutable-manifest comparison fails a valid control. | TEST-LEDGER-012 | Renewed intended catalogue assertion Red-02, Green/refactor PASS; membership, prefix, manifest-exemption and physical-state mutants detected and restored. The initial malformed-event setup failure is not Red evidence. |
| `REQ-LEDGER-005` | A real archived no-change fixture yields equal logical digests and unchanged physical state; its independent evidence validator accepts the intact result and rejects swapped manifest/archive state, missing archives or changed digests, and genuine receipts from another independently executed fixture under the wrong expected output. | A no-change proof continues to pass after an archive swap because only the empty tail or no digest equality is checked, or another valid fixture is replayed under the original expected output. | TEST-LEDGER-013 | Native Red-03 accepts genuine other-fixture evidence before correction and fails Missing expected exception; Green/refactor PASS. Tail-only producer, missing digest equality, physical-state and expected-root mutants detected and restored. Metadata-only replay Red-02 is not acceptance-hole evidence. |
| `REQ-LEDGER-005` | A gate refuses a transient archive mutation immediately after the first real project check, before a second check restores it; intact and restored controls pass. | Protect only the tail, execute both checks and accept the restored gzip as if no input changed. | TEST-LEDGER-009 | Genuine assertion Red/Green, current refactor PASS; tail-only snapshot mutant assertion-detected and restored. Earlier nineteen existing gate controls passed separately; the failed full run is retained. |
| `REQ-LEDGER-006` | Installed source/npm/Copilot/Claude entry points load the adapter and validate the same archive on each supported Node major. | Ship sdd.mjs without its adapter or omit archives from baseline reconstruction. | TEST-LEDGER-006 | Actual Linux Node20.20.2/22.23.3/24.22.1 each pass all thirteen required controls, including real npm pack, offline install, package wrapper and both init-copied hosts; zero required skips. Windows/macOS remain unrun; copied-host mutation/append is not claimed. |
### Retained remediation evidence
Session artifacts retain `ledger-compaction-remediation-final-native` logs,
`ledger-compaction-remediation-final-runtimes.json` and each native command log.
The isolated mutation report
`ledger-compaction-isolated-mutations-bOPbx3/report.json` records twenty
assertion-detected mechanisms, their restored passing controls and final
thirteen-test PASS; production SDK/adapter bytes remained unchanged.
An initial mutation-copy setup failed because an absent root SKILL.md was
requested; a later runner stopped at its exact literal-site count assertion.
Neither is mutation or product-failure evidence, and all final mechanisms ran.
The original full-gate failure is retained. Its original 46 failed tests
subsequently pass as 41 plus 5 real selected cases with the installed tool
environment corrected. At this evidence-table freeze, the unfiltered npm suite, refreshed planning
receipts, human artifact approval and full development gate were still pending.
Subsequent validation and approval outcomes belong to the dated feature review;
they do not retroactively turn this phase's pending work into passing evidence.
Metadata/logical-budget boundaries, gzip-bomb handling, corrupt Git baselines,
archive-link crash boundaries and real Windows/filesystem compatibility remain
explicit coverage limits, not passes or frozen qualification credit.
## Assumptions / risks
User selected automatic archival on append above 2 MiB. No payload deduplication, permanent evidence deletion, network restore, Git-history rewrite, release/tag/publish or change to the current frozen release candidate is authorized. Actual Node20.20.2/22.23.3/24.22.1 Linux spike preserved 2160998 UTF-8 bytes across an oversized row, rejected a corrupted gzip CRC, and passed staged fsync/rename/directory-fsync and live-PID probes (external ledger-compaction-storage-spike.log); this is not CLI/recovery/Windows evidence. Speed/RAM gains are unmeasured.
Contract: event identity/deletion policy; trusted inputs: manifest, gzip, paths and Git blobs; execution: size boundaries, concurrency and interrupted switches; verdict: no missing-evidence PASS; evidence history: original chain and referenced receipts; integration/distribution: both hosts, npm and Node 20/22/24. All six apply.
