---
feature: legacy-command-closure
tier: T2
approval: auto
---
Reverse spec: rows describe existing behavior; no check-definition policy is changed.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CHECK-CLOSURE-001 | When gate commands or Python plugin helpers change, the system shall retain transitive interpreter/wrapper/package/symlink and local Python import provenance, reject unresolved local imports before evidence writes, and reject unapproved definition drift in full and changed gates. [src: .github/skills/lean-sdd-tdd/scripts/sdd.mjs:6014, conf: low] | TEST-CHECK-CLOSURE-001, TEST-R34-PYREL-001 |
| REQ-CHECK-CLOSURE-002 | When npm/pnpm/yarn lifecycle hooks are added, edited or removed, the system shall treat the selected pre/post hooks and their wrappers as check definitions without treating unrelated scripts as drift. [src: .github/skills/lean-sdd-tdd/scripts/sdd.test.mjs:10156, conf: low] | TEST-CHECK-CLOSURE-003 |
| REQ-CHECK-CLOSURE-003 | When Cargo ancestor config or toolchain definitions are added, changed or removed, the system shall reject stale full/changed gate evidence until reverified. [src: .github/skills/lean-sdd-tdd/scripts/sdd.test.mjs:10187, conf: low] | TEST-CHECK-CLOSURE-004 |
| REQ-R34-CLOSURE-001 | When discovering a check's definition closure, the system shall include full launcher/bundle/helper/metadata bytes within the existing structural bounds and reject exhausted bounds before writing evidence; repeated candidates shall share per-closure discovery caches. [src: .github/skills/lean-sdd-tdd/scripts/sdd.mjs:5674, conf: low] | TEST-R34-CLOSURE-001, TEST-R34-CLOSURE-002, TEST-R34-CLOSURE-003, TEST-R34-CLOSURE-004 |
## PASS conditions and counterexamples
| REQ | PASS condition | counterexample | TEST/command | observed evidence |
| --- | --- | --- | --- | --- |
| `REQ-CHECK-CLOSURE-001` | unchanged/restored native controls pass; changed/deleted/ambiguous helpers refuse | local import disappears from protected snapshot; wrong Green accepted | TEST-CHECK-CLOSURE-001, TEST-R34-PYREL-001 | genuine characterization and Green recorded, including all additional annotated verifying tests |
| `REQ-CHECK-CLOSURE-002` | hook changes reject, unrelated script edits remain accepted | removed pretest hook accepted as unchanged | TEST-CHECK-CLOSURE-003 | genuine passing characterization and Green recorded |
| `REQ-CHECK-CLOSURE-003` | ancestor additions/removals stale evidence; refactor restores valid control | new ancestor config silently ignored | TEST-CHECK-CLOSURE-004 | genuine passing characterization and Green recorded |
| `REQ-R34-CLOSURE-001` | real TypeScript 5.9.3 runs within unchanged per-command 15-second fixture budget; full inputs pinned | truncated bundle, uncached per-token probes, or accepted exhausted discovery | TEST-R34-CLOSURE-001..004 | all four real-runner controls characterized and Green with unchanged fixture budgets |
Risk stages: contract=existing fixtures; inputs=complete closure; execution=bounded discovery; verdict=valid and refusal controls; history=real characterization only; integration=full repository suite.
## Design
Restore the missing authoritative REQ definitions used by existing production/test annotations; reuse the implementation and all existing fixture assertions.
Only literal registration metadata is normalized for root evidence attribution; parameterized cases execute inside a single owned literal test, retaining every case and assertion.
## Assumptions / risks
These requirements were missing from tracked specs; they are reconstructed from current code/tests and existing config reference, not invented new policies. The Test column names representative controls; every discovered annotated verifying test was characterized, not just those examples.
The root preflight confirms 86/86 valid test histories but deliberately skips checks and exits 2; a full gate and separate frozen release matrix are still required.
