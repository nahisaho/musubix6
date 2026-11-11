---
feature: ci-regression-fixtures
tier: T2
approval: auto
dependsOn: implementation-plan-cli
artifacts: scripts/release-qualification.test.mjs, scripts/release-host-mutations.test.mjs, .github/skills/lean-sdd-tdd/scripts/sdd.test.mjs, .github/skills/lean-sdd-tdd/scripts/implementation-plan-cli.test.mjs
---
# Development CI fixtures without renewed release authorization

Restore the complete Node20/22/24 development suite for PR388 without changing
production qualification policy, active human approvals or historical catalogues.

| ID | EARS requirement | Test |
|---|---|---|
| REQ-CI-FIXTURE-001 | When constructing the historical0.2.8 qualification unit fixture, the test harness shall use the exact approved Git snapshot703a4fed16b781a229a9ce85eeb2e83446ba8d8a for its seven-artifact lock, artifacts, inherited manifest, lineage suite and historical package metadata, independently of current development documentation; admission shall accept that unchanged fixture and reject its modified artifacts without writing production approval or qualification evidence; discovery-only registration from a Git-free candidate shall not construct fixtures or read Git history, while selected fixture tests shall still require their genuine pinned Git inputs. | TEST-CI-FIXTURE-001 |
| REQ-CI-FIXTURE-002 | When exercising host mutation adapters against the current development checkout, the test harness shall select the stable target version from its package manifest and require every inherited host mutation to apply and the actual version/package controls to detect and restore their changes; historical version-specific parser cases shall remain fixed. | TEST-CI-FIXTURE-002 |
| REQ-CI-FIXTURE-003 | When the retained gate-help regression runs, its expected usage shall match the approved complete global-help contract while still requiring exit0 and absence of gate execution. (test-only) | TEST-CI-FIXTURE-003 |

## PASS conditions and counterexamples

| REQ | PASS condition | Counterexample | TEST/command | Observed evidence |
|---|---|---|---|---|
| `REQ-CI-FIXTURE-001` | Historical seven-artifact fixture admits with24 required cells and no publication/old credit; historical package/lock versions remain0.2.8; changed fixture README and missing historical file reject without a live-source fallback; production bytes remain unchanged | Copy development README0.2.10 beside its old0.2.8 human hash; copy current0.2.10 package metadata beside historical0.2.8 execution contracts; use a current-only spec when its Git blob is missing | TEST-CI-FIXTURE-001; existing release qualification suite | Push CI42717700965 fails11 dependent controls per major; seven approved hashes match703a4fe; first raw regression assertion FAIL instead of PASS; follow-on focused run26/28 exposes2 stale package-metadata controls |
| `REQ-CI-FIXTURE-002` | All28 host adapters apply to current0.2.10 inputs; actual version/package baseline and restoration pass | Use0.2.8 mutation anchors on0.2.10 package/CLI metadata: anchor failure instead of testing a mutant | TEST-CI-FIXTURE-002; TEST-RELQ-HOST-001 | Native assertion Red for missing version anchor, unchanged-test Green; all28 adapters and actual restored host controls pass on Node24 |
| `REQ-CI-FIXTURE-003` | Retained `#258 gate --help` passes under global usage and still proves no gate ran | Require obsolete `usage: gate` although the approved dispatcher prints `usage: sdd.mjs` and the complete command list | TEST-CI-FIXTURE-003; retained exact case | Native assertion Red for retained help regression exit1, unchanged-test Green; retained named control passes |

## Design

Change only development-test fixtures and their assertions. Read historical
fixture bytes with literal `git show <pinned-commit>:<path>`; unavailable objects
must fail explicitly, never fall back to current source or rehash a live approval.
Retain the production validator's exact seven-artifact comparison and the
current checkout's stale-lock rejection. Fixture admission grants no fresh
candidate readiness, human authorization or qualification credit.

The historical snapshot is a test reference, not a0.2.10 release plan. Keep its
0.2.8 target,24 cells, budgets, lineage, catalogues and all rejection controls.
Keep current development host-version tests separate from this reference.
Do not rename/delete inherited test cases, skip checks, modify production
approval hashes or narrow the CI/release matrix.

For Git-free discovery, defer those same pinned reads until a selected test
starts. Set the shared ready marker only after every read succeeds. Do not
give discovery Git metadata, catch missing-history errors, add fallback bytes,
or change the candidate materializer. The paused correction is integrated
without changing the original fixture inputs or execution assertions.
The regression removes inherited `GIT_*` routing/object-store settings before
setting its own ceiling, as well as Node injection variables; an external
repository must not turn its deliberately Git-free child into a Git-backed one.

| REQ | PASS condition | Counterexample | TEST/command | Observed evidence |
|---|---|---|---|---|
| `REQ-CI-FIXTURE-001` | Register the actual module in a complete Git-free copy with `(?!)`: exit0; select `^TEST-RELQ-001 ` there: exit1 with missing genuine Git-history diagnostic; normal repository fixtures pass | Eager reads make registration exit1; suppressing reads or adding live fallbacks makes selected execution pass or fail without the required history diagnostic | TEST-CI-FIXTURE-001; isolated eager-initialization mutation; actual Git-free discovery | Current integration obtained genuine native assertion Red before implementation, then Green after reviewed artifact-lock renewal. Reintroducing eager initialization was assertion-detected; byte-exact restoration matched the pre-mutation approval and native refactor plus all26 affected release/host tests passed with0skips. Exact integration-stage module bytes also passed both controls on real Node20/22/24. Historical2cff failure and paused proof are retained provenance, not qualification credit. |

This S2 first violates trusted inputs: discovery intentionally has no Git
history, but eager construction requests it before test execution. All six
stages apply: contract=separate discovery/execution; inputs=exact pinned Git;
execution=actual module registration and selected failure; verdict=valid
acceptance plus invalid rejection; history=retain the failed freeze and reset
on the new candidate; integration=new committed source, full gate, same-head
CI and two unchanged complete qualification runs. No stage is waived.
The feedback candidate01e1f0d has a 1211-test development gate and current task
proof, not release credit. Its root JS diagnostics passed47/47; prior missing
flat-config observations below remain historical, not current failures.

Current integration evidence is retained in the session's
`v0210-feedback-registration-integration-native-{red,green-02,restored}.log`,
`v0210-feedback-registration-integration-eager-mutation.log`,
`v0210-feedback-registration-integration-restoration.json`,
`v0210-feedback-registration-integration-restored-suites.log` and
`v0210-feedback-registration-current-runtimes/summary.json`.
The integration-stage module SHA256 is
`1a679956ea38ee3e40b301399f1340c7fdc33f83a727f3511584d5d95379244f`.
Each real runtime20.20.2/22.23.3/24.22.1 registered the exact Git-free copied
module with exit0 and rejected selected execution with exit1 and the required
missing-history diagnostic. The first proposed-source spike's import-count
setup failure and the stale-lock Green refusal are retained, not Red evidence.
Current JS diagnostics passed; the current plan has8 honestly pending
affected tasks, with measured bindings and retained history-head receipts.
Their fresh verification, the new full gate, additive content-inventory
renewal and frozen qualification remain required. No run credit is claimed.

Six first-failure stages: contract = distinguish historical fixtures from
current release authorization; trusted inputs = pinned Git bytes and real
current package metadata; execution = run every existing positive/negative
control, with restored isolated mutations; verdict = valid controls accept and
stale artifacts reject; history = retain failed CI42717700965 and zero transferred
qualification credit; integration/distribution = complete Node20/22/24 CI before
merging PR388. No stage is waived. Root full-gate and static-diagnostic limitations
remain separate from a successful development CI, and no publication is requested.

## Assumptions and actual evidence

The Git comparison spike matched all7 authentic artifact hashes at the pinned
revision. Its package.json and both root/package-lock versions are0.2.8.
Current package0.2.10 satisfies the host adapter's stable-version policy.
The existing CI checkout fetches complete history; absent historical objects
are errors, not permission to synthesize an approval or use live fallback bytes.

All3 new native regressions have assertion Red and Green records in the real
append-only ledger. The first historical-input Red rejects a changed README;
the refined package-metadata Red independently fails0.2.10 versus0.2.8 before
fixing package construction. The final affected run passes28/28, zero skips,
on Node24.22.1. Five isolated mutations each failed its regression by assertion:
live historical artifact reads; live fallback for a missing Git object;
old current-host version anchors; current manifests in historical package
fixtures; and obsolete command-help expectations. Original bytes were restored,
then all3 regressions passed. Earlier mutation-driver anchor setup failure is
not credited as a detection.

Historical input audit also routes content references, historical mappings,
scanner suite and baseline/skill inventory references through the same pinned
materialization. Remaining current-root reads deliberately exercise current
production modules, current literal test discovery, dependencies, publication
workflow or unchanged-source comparisons, not historical fixture metadata.

Full-scope binding preview passed with126 tasks and no unknown fingerprints.
Ordinary plan check reached its600-second bound without a JSON verdict:
INCOMPLETE, not a consistency pass. JavaScript diagnostics are INCOMPLETE2
because this repository lacks a root ESLint flat configuration; syntax and
whitespace checks pass. Hosted full CI and the final full gate remain pending.
New tasks retain in-progress status; no receipt or release completion is invented.
