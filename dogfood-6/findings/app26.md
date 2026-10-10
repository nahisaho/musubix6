# app26 (py-typeinfer: Hindley-Milner, Python 3 + pytest) findings

App: dogfood-6/app26-py-typeinfer — 6 features (parse, types, unify, infer, pretty, report), 59 REQs, 59 tests, full `gate` exit 0.
Repro dir for F1/F2/F3: dogfood-6/findings/repro-app26-a (`S="node .../sdd.mjs"`).

## F1. `tdd stub` (Python): methods are attributed to the WRONG class when the same variable name is bound to different classes in different tests
Repro (in repro-app26-a, tests/test_a.py has `s = Counter(); s.fresh()` in TEST-A-003 and `s = Sub({1: 2}); s.apply(1)` in TEST-A-004; src/pk/m.py absent):
  rm -rf src/pk/m.py; $S --root . tdd stub TEST-A-003; cat src/pk/m.py
Actual: `class Sub` also gets `def fresh(...)` (belongs to Counter, from TEST-A-003) and `apply` is NOT generated; stub for TEST-A-003 contains a class (Sub) it does not use, and the test of Sub (TEST-A-004) later fails with `AttributeError: 'Sub' object has no attribute 'apply'`.
Expected: only the requested test's receivers are resolved (docs/stubs.md #130/#131: "stubs cover only the requested test"); `Sub` should get no `fresh` (and `Counter` no `apply`); methods are keyed per test region, not per variable name file-wide.
Suspected: `methodsOf` (sdd.mjs:1321-1345): `vars` (line 1326) collects every `v = Cls(` assignment in the whole source and then collects `v.m(` calls for each class → name collision across tests/classes. Same in app26 TEST-TYPES-001 stub (Subst got `fresh`/`reserve` from `s = Supply()` in another test, and lacked `apply`).
Workaround: edit the stub by hand (or use unique variable names per class).

## F2. Weak-Red false positive: `x = act(); y = [.. for .. in x]; assert y == ..` flagged "setup call", while `res = act(); assert res == ..` is not
Repro (repro-app26-a):
  $S --root . tdd red TEST-A-001      # body: toks = tokenize("a b"); got = [t for t in toks if t != "x"]; assert got == ["a","b"]
Actual: `... NotImplementedError: tokenize [weak] ⚠ Red comes from setup call "tokenize", not the asserted behaviour`; TEST-A-002 (`res = tokenize(..); assert res == ..`) is NOT weak. The act IS the SUT call whose derived value is asserted; the stub throwing there is the correct Red.
Expected: not weak (a variable derived from the act and then asserted is the act, like the direct form).
Suspected: setupOrigin / weak heuristic (sdd.mjs:1724, caller 1979): only direct `assert f(..)`/`x = f(); assert x` are recognised, one-step derivation (comprehension/slice/attribute of the result) is not.
Workaround: `tdd red <ID> --allow-setup-red` (or inline the call into the assert). In app26 TEST-PARSE-001 stayed weak in the gate.

## F3. gate: `tdd red --retest` runs are reported as "characterization: passed without a failing Red" and the IDs are not listed
Repro (app26): after fixing a wrong test expectation with `tdd red TEST-TYPES-005 --retest "<why>"` (and the same for TEST-PARSE-011), `$S --root dogfood-6/app26-py-typeinfer gate | grep evidence`
Actual: `3 weak Red — … : TEST-PARSE-001 (2 characterization: passed without a failing Red)` — 3 weak but only 1 ID is listed; the 2 retests are counted as "characterization" (they are not; they're retests of a corrected test) and cannot be identified.
Expected: list every weak/retest ID with its kind (e.g. `TEST-TYPES-005 [retest]`), and don't call a retest a characterization.
Suspected: sdd.mjs:388 (`charac: !!(r.characterization || r.retest)`) and summary line 2284 (`weakIds` printed only when `weak > charac`, characterization/retest IDs never listed).
Workaround: `grep retest .sdd/tdd.jsonl`.

## F4. (low) `impact <unannotated shared file>` reports every REQ of every feature in the directory as "same feature"
Repro (app26): `$S --root dogfood-6/app26-py-typeinfer impact src/hm/ast.py`
Actual: `same feature: 41 other REQ(s) (REQ-INFER-010, …)` — ast.py has no annotations and lives in the same directory as 6 features' code; the output has no `impl:`/`verified by:` split, no `other features:`/`!` rows, though parser/infer/pretty/report (4 features) import it. Compare `impact src/hm/types.py` (annotated) which correctly shows `! other feature` rows.
Expected: for a shared unannotated module list the features per importer (parse, infer, pretty, report) with `!`, not an undifferentiated "same feature" count.
Suspected: the "unannotated file belongs to the features of same-directory annotated files" rule (enforced-rules.md) applied to a multi-feature directory.
Workaround: annotate the file (`# @id CODE-… @implements …`) or run `impact` on the importing files.

## Notes (not defects)
- `tdd red` accepted a `RecursionError` (TEST-PARSE-011 / TEST-REPORT-008) as Red; reasonable.
- Verified OK: T2 lock/review-file flow (template/check/record), stale lock after spec edit, `--retest`, multi-ID `tdd refactor`, wording-change stale detection, Python relative-import `impact`, parametrize/class-method pytest tests.
