---
feature: r36b-node-red
tier: T2
---
## Requirements
| REQ-R36B-LOAD-001 | When a native Node report contains only a failed test-file load, the system shall record module-level throwing-stub Red as weak with a no-test-body warning. | TEST-R36B-LOAD-001 |
| REQ-R36B-SYNTAX-001 | When native Node reports a SyntaxError, the system shall reject load Red and marked placeholders even with --weak. | TEST-R36B-SYNTAX-001 |
| REQ-R36B-ASSERT-001 | When the exactly owned test fails with AssertionError, the system shall accept strong Red despite embedded child load diagnostics, without borrowing message text or sibling assertion metadata. | TEST-R36B-ASSERT-001 |
## Design
Keep the native command/report boundary and existing literal-registration ownership. Normalize TAP diagnostic comment prefixes only within native TAP classification; read exception metadata at its exact diagnostic indentation and owning location, not inside multiline messages. Recognize exact failed file rows in TAP/spec without treating them as annotated execution. No dependencies, runner changes, iterator-helper edits, compiler tuning, or full-suite qualification.
## PASS conditions / counterexamples (before implementation)
| REQ | PASS condition | Counterexample | TEST/command |
| `REQ-R36B-LOAD-001` | TAP/spec module stub returns 0, ledger weak=true and warning; in-body stub remains strong. | File row is strong; matching ID-bearing filename impersonates registration. | TEST-R36B-LOAD-001; targeted native controls |
| `REQ-R36B-SYNTAX-001` | Unmarked syntax rejects unless explicitly weak; marked syntax always rejects with element/location and no ledger. | TAP "# SyntaxError" ignored; placeholder accepted with --weak. | TEST-R36B-SYNTAX-001 |
| `REQ-R36B-ASSERT-001` | Owned typed assertion with child stderr returns 0, weak=false; TypeError/SyntaxError containing AssertionError-like text and sibling assertion metadata cannot override load classification. | Global name/code substring suppresses real load error; unrelated/duplicate/skipped titles give evidence. | TEST-R36B-ASSERT-001; targeted ownership/provenance controls |
## Evidence
Native fixture spike: session `files/r36b-tap-node{20,22,24}.log`, actual versions 20.20.2/22.23.3/24.21.0 with proper bin PATH. TAP file failures use filename rows and "# " diagnostics; assertions use indented name/code metadata. Node20 spec repeats diagnostics before summary and labels runtime SyntaxError as `SyntaxError [Error]`; Node22/24 spec emits diagnostics after summary. Expectations above derive from existing #225/#283/#r25a/#282 and enforced-rules.md, not reporter output. History/ledger inspected by regressions; integration is targeted only.

All retained raw evidence lives outside the worktree in `/home/nahisaho/.copilot/session-state/ba9f04e0-ab0d-4d64-ac09-eec2b5ef0ba5/files` (`F` below).
- Assertion Red before source edits: `r36b-red-assertion-node{22,24}.log`, exit 1: Node22 0 pass / 8 assertion failures; Node24 4 pass / 4 assertion failures. All four appended regressions fail on both runtimes; Node24's default spec reporter already handles the four original counterexamples. Initial fixture-setup attempts are retained separately as `r36b-red-node{22,24}.log` and are not Red proof.
- Node20 isolated integration before the owned-spec SyntaxError refinement: `r36b-green-integrated-node20.log`, exit 1, 12 pass / 2 assertion failures; the `[Error]` format was not an iterator crash. Final integrated scratch: `r36b-green-final-integrated-node20.log`, exit 0, 14 pass / 0 fail / 1067 name-filtered exclusions. Only #365's two approved iterator replacements differ from this branch's source; neither replacement is committed here.
- Final bounded validation: `bash "$F/r36b-validate.sh"` exits 0; `r36b-green-final-node{22,24}.log` each records 42 pass / 0 fail / 0 skipped / 0 TODO, including reporter, registration, startup-definition and executable-provenance controls. `r36b-green-final-parser-node20.log` records 2 pass / 0 fail / 1079 name-filtered exclusions without the scratch integration. Node20 prints excluded tests as skipped, unlike Node22/24; these are selection exclusions, not executed or skipped evidence.
- Bounded mutations: `r36b-mutation-final-node22.log` (seven mechanisms) and `r36b-mutation-final-node20.log` (eight, including owned spec SyntaxError); each driver exits 0. Every mutant exits 1 by assertion, byte-identical restoration exits 0, and production bytes remain unchanged. Per-mechanism raw logs are `r36b-{20,22}-{mutation,restored}-*.log`. Controls cover in-body strong stubs, valid owned assertions, weak unmarked syntax, rejected marked syntax, wrong location, sibling/duplicate/skipped/TODO titles and multiline impersonation.
- Tests are EOF-only additions: 125 lines / 7013 bytes. No full suite, full gate, compiler performance test, push, stash or worktree cost-log regeneration.

Reproduction commands (proper runtime bin first in PATH; each log records version/executable):
```sh
F=/home/nahisaho/.copilot/session-state/ba9f04e0-ab0d-4d64-ac09-eec2b5ef0ba5/files
bash "$F/r36b-validate.sh"
PATH="$F/runtime22/node-v22.23.3-linux-x64/bin:$PATH" node "$F/r36b-mutation.mjs"
PATH="$F/runtime20/node-v20.20.2-linux-x64/bin:$PATH" R36B_MUTATION_SOURCE="$F/r36b-node20-integrated.mjs" node "$F/r36b-mutation.mjs"
PATH="$F/runtime20/node-v20.20.2-linux-x64/bin:$PATH" SDD_SCRIPT_UNDER_TEST="$F/r36b-node20-integrated.mjs" node --test --test-reporter=tap --test-name-pattern='#366|#225 node:test module-level|#283 a module-level|#282 Red:|#r25a tdd red rejects a load error located in a marked TS|#154|r34e #361 (parser|opaque)' .github/skills/lean-sdd-tdd/scripts/sdd.test.mjs
```
