# app29 (polyglot TS + Py job platform) findings

Setup: `S="node /home/nahisaho/GitHub/musubix6/.github/skills/lean-sdd-tdd/scripts/sdd.mjs"`; app in `dogfood-6/app29-polyglot-ts-py` (5 features, 52 REQs, TS vitest `api/` + Py pytest `worker/` + `contract/`, `projects[].dependsOn:["contract"]`). Final `gate` = PASS (exit 0).

## 1. `review check` / `approve record --review <file>` accept unresolved findings (false negative)
Repro (in app29 dir, `H` = first line `spec: sha256:...` of `.sdd/review.md`):
```
printf '%s\nverdict: pass\nopen: 0\n\n## Findings\n| ID | Severity | Where | Status |\n|----|----------|-------|--------|\n| F1 | high | queue.ts:40 | Open - needs fix |\n| F2 | high | a | Pending |\n' "$H" > r.md
$S --root . review check r.md --feature contract     # -> REVIEW OK
$S --root . approve record contract --by ai:x --review r.md   # -> locked
```
Also a bullet finding with no status (`- F1 high: SQL injection not fixed`) → OK.
Actual: REVIEW OK, lock granted with a high "Open - needs fix"/"Pending" finding. Expected: statuses other than an explicit Closed/Resolved (or "Open ..." with trailing text) should count as open or be rejected as "finding without explicit status" (the docs say findings "carry an explicit status").
Location: sdd.mjs:689 `isOpenLine` (table cell must equal exactly `open`; `Open - …`, `Open (high)`, `Pending` not matched) and 690-700 `reviewProblems` (no check that every finding row has a recognised status).
Workaround: write status cells as exactly `Open`/`Closed`.

## 2. Weak-Red (setup) false positive when the act result is asserted via chained comparison / tuple / non-leading position
Repro (`dogfood-6/findings/repro-app29-a`, pytest.ini `pythonpath = .`):
```
def test_a_001_chain():
    for seed in range(3):
        v = f(seed)          # f stub raises NotImplementedError
        assert 4.0 <= v <= 8.0
# and
    r = f(1)
    assert (r.x, r.y) == (1, 2)
$S --root . tdd red TEST-A-001 TEST-A-003
```
Actual: `[weak] ⚠ Red comes from setup call "f", not the asserted behaviour` for both (`assert v >= 4.0`, `assert r.x == 1 and r.y == 2` are NOT flagged). Expected: `v`/`r` is the asserted result in all forms; not weak. Same in app: TEST-RET-005 (`assert 4.0 <= v <= 8.0`), TEST-EXE-003/004/…/011 (`assert (r.state, r.result, r.attempts) == (...)`) – 8 weak Reds in the final gate.
Location: sdd.mjs:1756 `subject` regex in `assertedResult` only matches the variable as the *first* token after `assert`/`expect(`.
Workaround: `tdd red <ID> --expect <name>` (or rewrite the assertion to `assert r.state == ...`).

## 3. `projects[].dependsOn` paths are not validated/normalised: `./contract` or a typo silently disables contract-triggered gating, and the hint is misleading
Repro:
```
sed -i 's#"contract"#"./contract"#' .sdd/config.json   # (or "contrct")
echo >> contract/job.json
$S --root . gate --changed
```
Actual: `! root-owned data/config changes: contract/job.json — … add the path to its dependsOn` AND `! cmd api:test: no changed files in api or its dependencies (./contract) — skipped` (verdict PASS, no tests run). The hint tells the user to add a path that is already there; a nonexistent dir (`contrct`) is accepted with no config error. `"contract/"` works.
Expected: normalise leading `./` (and `\`), and warn/fail on `dependsOn` entries that don't exist on disk.
Location: sdd.mjs:2314 and 2321 (`d.replace(/\/$/, '')` only strips a trailing slash); no config validation.
Workaround: use `"contract"`.

## 4. `impact <json file>` reports nothing for a shared JSON contract imported by TS code
Repro: `api/src/states.ts` has `import table from "../../contract/states.json"`; `api/src/validate.ts` imports `../../contract/job.json`.
```
$S --root . impact contract/states.json
```
Actual: `impl: contract/states.json` / `reaches 0 file(s) via imports` (labelled as *implementation*; no REQs, no tests). Expected: reach `api/src/states.ts` → CON REQs/tests and downstream queue. (Python readers via `Path(...).read_text()` can't be seen, but a static TS `import x from "x.json"` can.) Also `gate --changed` for a contract-only change shows `tdd evidence (changed scope): 0/0` — evidence of dependent features is never re-checked (only project checks run).
Location: sdd.mjs:118 `EXT` (no `json`, so JSON files are not graph nodes) and the JS import resolver (`jsRev`, ~2170-2200: extension lists lack `.json`).
Workaround: `dependsOn` + full `gate`.

## 5. Weak-Red message names the wrong symbol (constructor instead of the stubbed method)
Repro: TS test `const q = new JobQueue({...}); const id = q.enqueue(mk(), T0).id; ... q.dequeue(T0)`; stub from `tdd stub` throws `not implemented: JobQueue.enqueue`.
`tdd red TEST-QUE-002` → `⚠ Red comes from setup call "JobQueue", not the asserted behaviour`. Expected: `"enqueue"` (the throwing member; the constructor stub never throws). Hint `--expect enqueue` is what actually works, but the message points the user to the constructor.
Location: sdd.mjs:1725-1727 `setupOrigin` regex `not implemented:?\s*(?:[\w$]+::)*([\w$]+)` handles `::` paths but not `Class.method` dotted paths, capturing `JobQueue`.
Also (usability): for stateful APIs, `tdd stub` makes every method throw, so any test whose setup uses the API is weak Red (10/12 QUE tests, 8 EXE tests); no stub option to keep setup methods working.

## 6. Spec table `Test` column is never validated (low)
Repro: in `.sdd/specs/retry.md` change `TEST-RET-006` in REQ-RET-006's row to `TEST-RET-099`; `$S --root . trace` → `TRACE OK: … 0 errors, 0 warnings`. Expected: warn that the listed test id does not exist / does not `@verifies` that REQ (only `@verifies` is checked).
