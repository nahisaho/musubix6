# app02 (py-workflow) findings

Repros live in `dogfood-6/findings/repro-app02/r*` (S=`node .github/skills/lean-sdd-tdd/scripts/sdd.mjs`).

## 1. Python collection-time errors (AttributeError/NameError/TypeError at import) are accepted as Red
- Repro: `cd dogfood-6/findings/repro-app02/r2 && $S --root . tdd red TEST-M-001` (module-level `VALUES = [Color.RED]` where `Color` has no `RED`).
- Actual: `RED ok ... fails with: AttributeError: type object 'Color' has no attribute 'RED' [weak]` exit 0, although pytest says `ERROR collecting tests/test_m.py ... Interrupted: 1 error during collection`. In app02 (`@pytest.mark.parametrize("terminal",[State.SUCCEEDED,...])` with a stub `State` lacking members) all 10 TEST-STORE-* got `RED ok`, 001 and 002 etc. even NON-weak, i.e. the whole module failed at collection and every test was "proved Red".
- Expected: a pytest collection error is a load error: `RED REJECTED ... load/compile error` (unless --weak).
- Location: `LOAD_ERR` regex sdd.mjs:519 only matches ImportError/ModuleNotFoundError/SyntaxError; no `ERROR collecting` / `Interrupted: N error during collection` pattern; used at 1374 and 1385.
- Workaround: hand-wrote complete stubs (enum members) so the module imports, then re-ran `tdd red`.

## 2. `tdd stub` attributes helper-tuple-unpacked non-SUT variables as methods of the stubbed class
- Repro: `cd dogfood-6/findings/repro-app02/r4 && $S --root . tdd stub TEST-M-001; cat pkg/eng.py`
  (test: `def make(): log=[]; return Eng(log), log` / `eng, log = make(); eng.run(); assert log.count("x")==1`).
- Actual: `Eng` gets `run` AND `count` (from `log.count(`). In app02 `Engine` got bogus `append`, `history`, `state`, `now` (from `log.append`, `store.history`, `store.state`, `clock.now`), all from `eng, store, clock, log = setup(...)`.
- Expected: only methods called on the variable that holds the class instance (`eng`), or at least not on every name unpacked from the helper.
- Location: `methodsOf` sdd.mjs:1046-1052 (helper tuple-unpack branch pushes ALL unpacked names into `vars`).
- Workaround: edited the stub by hand.

## 3. Weak-Red heuristic false positive: bare act statement whose side effect is asserted
- Repro: same r4: `$S --root . tdd red TEST-M-001` -> `[weak] ⚠ Red comes from setup call "run", not the asserted behaviour`, although `eng.run()` IS the act (assertions check the log it mutates). Also app02 TEST-RETRY-009 (`run_with_retry(...)` then `assert seen == [...]`), TEST-ENGINE-001/002/008/010 (`eng.run()` then asserts on log/store).
- Expected: the last non-assert statement before the first assertion (bare call) should count as the act (as is already done for `.unwrap()` in Rust). Conversely tests whose only stub hit was setup (e.g. TEST-DAG-002) vary between weak/non-weak unpredictably (STORE-002..004 `s.transition` setup: STORE-003 not weak, 002/004 weak).
- Location: `setupOrigin` sdd.mjs:1195-1262 (last-statement rule only for `.unwrap/.expect`, line ~1258; `assertedResult` needs `x = f()` + assert on x).
- Workaround: `--allow-setup-red` (this makes real setup-only Reds equally acceptable).

## 4. Refusal message for auto-approval T2 points to the wrong command
- Repro: in app02 (T2 spec `store` unlocked) `$S --root . tdd red TEST-STORE-001`.
- Actual: `REFUSED: T2 feature store approval is missing. run: approve prepare store`. `approve prepare` for an `approval: auto` spec only prints that one must run `approve record <f> --by ai:<reviewer> --review ...`; prepare is not needed.
- Expected: message should say `approve record store --by ai:<reviewer> --review <summary>` for auto specs (prepare only for `approval: human`). Same for "stale" (`tdd red` after spec edit printed `approval is stale. run: approve prepare engine`).
- Location: sdd.mjs:1332.

## 5. `tdd red` load-error hint tells to run `tdd stub` for a name missing from an existing real-code module, but stub refuses
- Repro: add `no_retry_policy` to an import from existing `wf.retry.policy` (real code) in a test, then `$S --root . tdd stub TEST-RETRY-010` -> `! not stubbed: no_retry_policy in src/wf/retry/policy.py — ... add the names by hand` ; `$S --root . tdd red TEST-RETRY-010` -> `RED REJECTED ... new module? run tdd stub <ID> (or --missing-module)`.
- Actual: advice loops (`stub` can't help, and `--missing-module` doesn't apply to a missing name in an existing module; only `--weak`/hand stub does). `stubs.md` says Python new names are appended only to modules still holding only stubs, so this is documented, but the Red message should mention "add a throwing stub by hand" for this case.
- Location: sdd.mjs:1374 (message), 1321.
- Workaround: hand-written `raise NotImplementedError` function.

## 6. Python stub location ignores `pytest.ini` `pythonpath = src` (src layout) when `src/` does not exist yet
- Repro: `pytest.ini` with `pythonpath = src`, no `src/` dir, `$S tdd stub TEST-DAG-001`.
- Actual: stubs written to `wf/dag/*.py` at repo root. Expected: honor `pythonpath`/`pyproject [tool.pytest.ini_options] pythonpath`/`setuptools package-dir` (or at least warn). (Only works at root because `python -m pytest` adds cwd, but the real src layout then diverges.)
- Location: srcLayout detection sdd.mjs:1079 (requires an existing `src/<pkg>/__init__.py` or `src/<top>`).
- Workaround: `mkdir -p src/wf && touch src/wf/__init__.py` before stubbing.

## 7. Lock still reports `ok [ai, review file]` after the cited review file is deleted
- Repro (app02): `$S --root . approve record store --by ai:code-review --review .sdd/review.md` (valid file), then `rm .sdd/review.md; $S --root . gate`.
- Actual: `✓ lock store: ok [ai, review file]`, gate PASS. Expected: gate should note/flag missing review evidence (or record a hash of the review file in the ledger and fail/warn when missing/changed).
- Location: approve-record at sdd.mjs:630-640 (validated once; gate lock check does not re-read the review path).

## 8. `impact <file>` labels REQs of the file's own feature as "other feature"
- Repro (app02): `$S --root . impact src/wf/dag/algo.py` (algo.py has no annotations; imported by dag/graph.py).
- Actual: `other features: dag (9), engine (11)` and `! other feature REQ-DAG-001 [dag] ...`. Expected: algo.py is a dag-internal helper (owner of the importing implementation), so dag REQs should be "same feature"/"directly affected", not flagged as foreign-feature `!` ones. Without owner info, the "other" wording/`!` is misleading.
- Location: impact printing in sdd.mjs (feature ownership taken only from `@implements` in the target file).
