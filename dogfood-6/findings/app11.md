# app11 (py sql engine) findings

## 1. `approve record --by ai:x --review <missing-file>` silently treats the path as a free-text summary
Repro (T2 `approval: auto` feature `planner`, valid design):
```
$S --root . approve record planner --by ai:r1 --review .sdd/missing-review.md
$S --root . gate --no-run | grep "lock planner"
```
Actual: `locked planner by ai:r1: …` and gate shows `lock planner: ok [ai, review summary]` — the nonexistent `.sdd/missing-review.md` literally becomes the "summary"; no review-file checks (0 Open findings, spec sha) ran. A typo in the path bypasses `review check` and (unless `requireReviewFile`) is never flagged.
Expected: when the value looks like a path (ends `.md`/contains `/`) and does not exist → `REFUSED: review file not found`.
Suspected: sdd.mjs:758-761 (`reviewIsFile` false → falls through as summary; only `requireReviewFile` refuses).
Workaround: always pass an existing file; check gate shows `[ai, review file]`.

## 2. `tdd stub` (Python) copies helper-built methods onto every class constructed in the helper
Repro: `pyproject.toml` with `pythonpath=["src"]`, `src/pk/__init__.py`, test:
```python
from pk.catalog import Catalog, Column
def make():
    cat = Catalog()
    cat.create_table("P", [Column("id", "INT", True)])
    return cat
# @id TEST-CAT-001 @verifies REQ-CAT-001
def test_cat_001_x():
    t = make().table("p")
    assert t.name == "P"
```
`$S tdd stub TEST-CAT-001` → actual `src/pk/catalog.py`: `Catalog` gets `table`, `create_table` (right) but `Column` also gets `def table(...)` (wrong). Seen in a bigger case too: `column_index`/`insert` landed on `Catalog`/`Column`. Expected (stubs.md: only the tuple slot / returned class instance gets methods): only `Catalog`.
Suspected: sdd.mjs:1321-1340 `methodsOf` non-strict helper detection — any helper whose body mentions `Cls(` assigns all methods called on the helper result to every class constructed in it; used at :1604.
Workaround: delete the extra methods by hand (harmless but misleading, and the stub is not "provably that class").
