---
feature: r36f-fixture-layout
tier: T1
---
## Requirements
| REQ-R36F-LAYOUT-001 | When r35a installer/admission controls run from repository root or the scripts directory, their fixtures and pack destinations shall remain outside every distributed payload subtree, preserving all existing assertions and timeout budgets. (test-only) | TEST-R36F-LAYOUT-001 |
## PASS conditions and counterexamples
| REQ | Observable PASS | Counterexample | TEST/command | Evidence |
| `REQ-R36F-LAYOUT-001` | Actual fixture directories observed before native copying/packing are outside every package.json files entry from both cwd choices; all source/packed positive and invalid-init controls pass. | scripts cwd embeds r35a-init/r35a-pack/r35a-admission/r35a-admission-pack under distributed skills; filesystem-containment assertion must fail before copy/pack. | TEST-R36F-LAYOUT-001; bounded r35a/r35b controls | Actual assertion Red; six Green cells; three assertion-failing cwd mutants; six byte-identical restored Green cells, detailed below. |
Oracle: filesystem realpaths and package.json distribution entries, not fixture implementation strings or a successful installer verdict.
Scope: fixture-only T1; production sdd.mjs and bin/musubix6.mjs unchanged; no CLI behavior change, older fixture relocation, dependency changes, raised budgets, skips, full suite or release qualification.
Risks: contract/inputs retained by original installer assertions; execution/layout checked before native work; verdict uses assertion failures; history checked by prior admission snapshots; integration bounded to actual Node20.20.2/22.23.3/24.21.0 from both documented working directories.
Assumption: repository-root scratch is excluded by the package files allowlist; pack output must not be inside any distributed pack input subtree, extracted package, or installed package. Shared older fixture work remains unchanged.

## Implementation and bounded evidence
Base: exact `ba70c5258c4814a4ffb419997e5ecf6af780a217`, isolated worktree `/home/nahisaho/GitHub/musubix-fix-r36f`, branch `fix/r36f`. Only r35a fixture roots and their npm scratch directories use a checkout-relative root outside the package payload; `after` removes it. Pack, cache, extracted and installed directories are siblings, never nested inside a distributed source or each other. Every original positive/negative assertion is retained; native npm budgets remain 60000ms, installer/native controls 30000ms and packed top-level controls 120000ms.

Let `F=/home/nahisaho/.copilot/session-state/ba9f04e0-ab0d-4d64-ac09-eec2b5ef0ba5/files`, `T=.github/skills/lean-sdd-tdd/scripts/sdd.test.mjs`, `P='r35a|r35b|#370'`. Actual runtime bins were prepended to PATH: `$F/runtime20/node-v20.20.2-linux-x64/bin`, `$F/runtime22/node-v22.23.3-linux-x64/bin`, `/home/nahisaho/.nvm/versions/node/v24.21.0/bin`. Logs independently record parent version/execPath and the executable resolved by `spawnSync('node')`.

| Exact command after PATH setup | Actual result | Retained raw evidence under `F` |
| --- | --- | --- |
| From root, `node --test --test-reporter=tap --test-name-pattern='#370' "$T"` before fixture edits | Node20 exit 1, 0 pass / 1 `ERR_ASSERTION`: actual scripts-cwd fixture lies inside distributed `.github/skills`; root-cwd observations pass first. No copy or npm pack runs before the failure. | `r36f-red-node20.log` |
| From root, `node --test --test-reporter=tap --test-name-pattern="$P" "$T"`; from scripts, same command with `sdd.test.mjs` | All six Node20/22/24 × root/scripts cells exit 0, 11 pass / 0 fail / 0 TODO each: ten original r35a/r35b controls plus one new regression. | `r36f-green-node{20,22,24}-{root,scripts}.log` |
| Replace only the new workspace root with `process.cwd()`; from scripts, `node --test --test-reporter=tap --test-name-pattern='#370' sdd.test.mjs` | All three actual runtimes exit 1, 0 pass / 1 `ERR_ASSERTION`, specifically the distributed-payload containment violation. No ReferenceError, loader failure or timeout counts as mutation proof. | `r36f-mutation-cwd-node{20,22,24}-scripts.log`; archived `r36f-mutant-cwd-suite.mjs` |
| Restore exact pre-mutation bytes; `sha256sum -c "$F/r36f-restoration-sha256.log"` then repeat both `$P` commands | All six cells again exit 0, 11 pass / 0 fail / 0 TODO each; production, installer and test hashes all match. | `r36f-restored-node{20,22,24}-{root,scripts}.log`; archived `r36f-restored-suite.mjs` |

The EOF regression instruments actual directory creation, reports its realpath and deliberately stops the child control before native work; the parent applies the independent filesystem containment oracle. These stopped children are layout probes, not installer success evidence; the unchanged original controls execute natively in each selected matrix cell. The regression observes four fixture families from both working directories (eight probes per run). Node20 reports 1082 name-filtered exclusions; Node22/24 report zero skips. No selected test is skipped.

Delta checks: one new top-level case, **49 EOF lines**, suite registration count 1092→1093. Reversing only the seven scoped r35a fixture edits reconstructs the complete base test file byte-for-byte, preserving every old case and EOF test, including #368/#369. `node --check "$T"` and `git diff --check` pass. Production `sdd.mjs` is byte-identical to base (SHA-256 `5a26ef1eb9daae8ad71310ae35fdeef6c91cb88a792c70126742b9c4b65867a7`); installer is likewise identical (`23c09a048f5507e3869d123e61039324284d4698d9e17e7b71aaddbde01fd9a1`).
No npm ci was needed for these controls. No full suite/full gate, release qualification, production change, older-fixture relocation, timeout increase, push, stash or worktree cost generation was performed. Coordinator owns independent review, full integration and canonical cost accounting.
