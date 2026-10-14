---
feature: r36h2-pytest-cwd
tier: T1
---
REQ-R36H2-CWD-001 (test-only): When the hosted-pytest native fixture executes from a foreign suite cwd, it shall retain actual native assertion Red/Green and leave no pytest cache outside its owned runnerTemp.
| REQ | PASS condition | counterexample | TEST/command | evidence |
|---|---|---|---|---|
| `REQ-R36H2-CWD-001` | Existing H control passes from fresh foreign cwd and that cwd remains empty after fixture cleanup. | Inherited suite cwd receives .pytest_cache even though native checks pass. | TEST-R36H2-CWD-001; actual Node20/22/24 targeted H + new regression | Assertion Red; 2/2 selected passes per runtime; cwd-removal assertion failure and restored positive |
Scope: fixture-only cwd assignment; native pytest commands, offline real dependency wheels, cache provider, verdict assertions, production and workflows unchanged. No security/public-contract/state/history changes apply.
Proof constraint: the monolithic test file exceeds the honest 512KiB root scan limit; use a small external proof runner if recording script-ledger evidence, never claim root trace/full gate.
Actual commands: `node --test --test-name-pattern=TEST-R36H2-CWD-001 <suite>` asserts old H leaks .pytest_cache; `node --test --test-reporter=spec --test-name-pattern='TEST-R36H-PYTEST-001|TEST-R36H2-CWD-001' <suite>` passes both cases on actual Node20/22/24 (Node20 additionally labels unselected cases filtered skips).
Small tracked proof root runs `sdd.mjs --root .r36h2-proof tdd red TEST-R36H2-CWD-001`, then Green and `gate --changed`: 1 REQ, 2 genuine ledger entries, focused gate PASS. EOF regression and proof helper bytes remain unchanged between assertion Red and Green.
Mutation removes only `cwd: runnerTemp`: the foreign-cache assertion fails; byte-restored source passes and the focused small-proof gate passes again. Actual logs and retained proof under coordinator F/r36h2-*; no root/full-suite or readiness claim, global installation, policy weakening, cache ignore, disabled provider, or unowned cleanup.
