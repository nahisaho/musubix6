# app12 (py-crdt) findings

App: Python 3 + pytest CRDT store (vclock, counters, lwwmap, orset, sync, convergence); 62 REQs, 62 tests, full `gate` exit 0.
Repros: `dogfood-6/findings/repro-app12/{a,b,c}` (S=`node .github/skills/lean-sdd-tdd/scripts/sdd.mjs`).

## 1. `tdd stub` (Python) stubs methods used only by OTHER tests of the file (scope leak, contradicts stubs.md "#130 stubs cover only the requested test")
- Repro: `cd dogfood-6/findings/repro-app12/a; rm -rf pkg; $S --root . tdd stub TEST-M-001; grep def pkg/m.py`
  (tests/test_m.py: `test_m_001` calls only `Thing().a()`, `test_m_002` calls `Thing().b()`.)
- Actual: `pkg/m.py` contains `a` AND `b`. In the app, stubbing TEST-VCLOCK-001 (uses `increment`,`get`) produced `merge/compare/dominates/to_dict/prune`; TEST-LWWMAP-001 produced `delete/keys/merge/gc/items`.
- Expected: only the methods the requested test (+ shared preamble) calls.
- Suspected: sdd.mjs:1604 `stubOf` (and `isExc`/`isConst` at 1602-1603) call `methodsOf(src, n)` with the full-file `src` (1544) instead of the `scoped` source computed at 1546 (the JS branch at 1576 uses scoped `S`).
- Workaround: accept/trim by hand; harmless for Red but over-stubs (also hides "missing method" Reds for later tests).

## 2. `--retest` weak Red is reported as a "characterization" in gate
- Repro: `cd dogfood-6/findings/repro-app12/a` (already set up): `$S --root . gate | grep evidence`
  Sequence: red -> green -> edit test -> `tdd red TEST-M-001 --retest "typo"` -> green.
- Actual: `tdd evidence: 2/2 ..., 2 weak Red (2 characterization: passed without a failing Red)` although only TEST-M-002 used `--characterization`; the weak-ID list is suppressed because weak==charac. In the app: "26 weak Red ... (1 characterization ...)" after a single `--retest` on TEST-ORSET-007.
- Expected: retest counted/labelled separately ("1 retest") and listed as weak; not "passed without a failing Red".
- Suspected: sdd.mjs:388 `charac: !!(r.characterization || r.retest)`; message at 2284 (`weak > charac` hides the ID list).
- Workaround: none needed; just misleading.

## 3. `impact` misses `from <pkg> import <submodule>` (Python)
- Repro: `cd dogfood-6/findings/repro-app12/b; $S --root . impact crdt/lwwmap.py | sed -n 4p` (tests/test_zz.py has `from crdt import lwwmap` + `lwwmap.LWWMap(..)`; it also has `import crdt.counters as cc`).
- Actual: `reaches 5 file(s) ...; tests: tests/test_lwwmap.py, tests/test_sync.py, tests/test_convergence.py` (test_zz.py absent). `impact crdt/counters.py` DOES list tests/test_zz.py (dotted `import a.b as c` resolves).
- Expected: `from crdt import lwwmap` resolves to crdt/lwwmap.py (the stub generator already treats it as a submodule, see 1607) so test_zz.py is reached; false-negative impact for a very common Python style.
- Suspected: Python import resolver used by `impact` (heuristic, name-based) only follows `from pkg.mod import X` / `import pkg.mod`.
- Workaround: write `from crdt.lwwmap import LWWMap`.

## 4. (usability, low) pytest only autodetected via pyproject/pytest.ini/requirements.txt
- Repro: `cd dogfood-6/findings/repro-app12/c; $S --root . init` (only `tests/test_x.py` + `test_x.py`).
- Actual: `WARNING: stack not recognised (...pytest...)`, testCmd = Node fallback (`node --test`) although pytest tests exist; the warning text says "no package.json/pytest/..." (reads as if pytest was looked for in test files). In the app I had to create pytest.ini and delete config.json to re-init (init does not overwrite/refresh an existing config).
- Expected: also detect `tests/test_*.py`/`conftest.py`, or say "add pytest.ini/pyproject.toml/requirements.txt and re-run init (delete .sdd/config.json)".
- Suspected: sdd.mjs:413, 683.
- Workaround: create `pytest.ini` before `init`.

## Notes (not reported as defects)
- Weak-Red heuristic is still inconsistent for helper-built fixtures (TEST-SYNC-005 non-weak vs TEST-SYNC-009 weak with the same `trio()` setup) and `c.increment(2)` followed by `assert c.to_dict()==..` (TEST-COUNTERS-001) is flagged setup although increment is the act.
- Stub adds bogus methods to a class from unrelated variables of the same name (`Store.increment/decrement/append` from `c.increment`, `stores.append`).
