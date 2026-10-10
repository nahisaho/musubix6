import random

import pytest

from sqlengine.engine import Engine
from sqlengine.errors import SqlError
from sqlengine.expr import EvalError


def make_engine(**kw):
    eng = Engine(**kw)
    eng.execute("CREATE TABLE emp (id INT NOT NULL, name TEXT, dept INT, sal INT)")
    eng.execute("INSERT INTO emp VALUES (1,'ann',10,100),(2,'bob',10,200),(3,'cat',20,150),"
                "(4,'dan',NULL,50),(5,'eve',20,NULL)")
    eng.execute("CREATE TABLE dept (id INT, dname TEXT)")
    eng.execute("INSERT INTO dept VALUES (10,'eng'),(20,'ops'),(30,'hr'),(NULL,'ghost')")
    return eng


def q(sql, **kw):
    return make_engine(**kw).execute(sql).rows


# @id TEST-EXE-001 @verifies REQ-EXE-001
def test_exe_001_ddl_dml():
    eng = Engine()
    r = eng.execute("CREATE TABLE t (a INT, b FLOAT, c TEXT)")
    assert (r.columns, r.rows, r.rowcount) == ([], [], 0)
    r = eng.execute("INSERT INTO t VALUES (1, 2, 'x'), (-5, 1.5 + 1, 'a' || 'b'), (NULL, NULL, NULL)")
    assert r.rowcount == 3
    assert eng.execute("SELECT * FROM t").rows == [(1, 2.0, "x"), (-5, 2.5, "ab"), (None, None, None)]
    with pytest.raises(SqlError):
        eng.execute("INSERT INTO t VALUES (a, 1, 'x')")
    assert len(eng.execute("SELECT * FROM t").rows) == 3


# @id TEST-EXE-002 @verifies REQ-EXE-002
def test_exe_002_three_valued_filter():
    ids = lambda sql: [r[0] for r in q(sql)]
    assert ids("SELECT id FROM emp WHERE sal > 100") == [2, 3]
    assert ids("SELECT id FROM emp WHERE NOT (sal > 100)") == [1, 4]
    assert ids("SELECT id FROM emp WHERE sal > 100 OR dept IS NULL") == [2, 3, 4]
    assert ids("SELECT id FROM emp WHERE dept NOT IN (10, NULL)") == []
    assert ids("SELECT id FROM emp WHERE dept = NULL") == []
    assert ids("SELECT id FROM emp WHERE sal IS NULL") == [5]
    assert q("SELECT dept FROM emp GROUP BY dept HAVING NULL") == []


# @id TEST-EXE-003 @verifies REQ-EXE-003
@pytest.mark.parametrize("strategy", [None, "nested"])
def test_exe_003_inner_join(strategy):
    sql = "SELECT e.id, d.dname FROM emp e JOIN dept d ON e.dept = d.id ORDER BY e.id"
    assert q(sql, join_strategy=strategy) == [(1, "eng"), (2, "eng"), (3, "ops"), (5, "ops")]
    dup = "SELECT a.id, b.id FROM emp a JOIN emp b ON a.dept = b.dept ORDER BY a.id, b.id"
    assert q(dup, join_strategy=strategy) == [
        (1, 1), (1, 2), (2, 1), (2, 2), (3, 3), (3, 5), (5, 3), (5, 5)]
    eng = make_engine(join_strategy=strategy)
    eng.execute("CREATE TABLE f (x FLOAT)")
    eng.execute("INSERT INTO f VALUES (10), (20.0), (NULL)")
    assert eng.execute("SELECT e.id FROM emp e JOIN f ON e.dept = f.x ORDER BY e.id").rows == [
        (1,), (2,), (3,), (5,)]
    assert eng.execute("SELECT e.id FROM emp e JOIN dept d ON e.dept = d.id AND d.dname = 'ops' "
                       "ORDER BY e.id").rows == [(3,), (5,)]


# @id TEST-EXE-004 @verifies REQ-EXE-004
@pytest.mark.parametrize("strategy", [None, "nested"])
def test_exe_004_left_join(strategy):
    base = "SELECT e.id, d.dname FROM emp e LEFT JOIN dept d ON e.dept = d.id"
    assert q(base + " ORDER BY e.id", join_strategy=strategy) == [
        (1, "eng"), (2, "eng"), (3, "ops"), (4, None), (5, "ops")]
    assert q(base + " AND d.dname = 'ops' ORDER BY e.id", join_strategy=strategy) == [
        (1, None), (2, None), (3, "ops"), (4, None), (5, "ops")]
    assert q(base + " AND e.sal > 120 ORDER BY e.id", join_strategy=strategy) == [
        (1, None), (2, "eng"), (3, "ops"), (4, None), (5, None)]
    assert q("SELECT d.dname, e.id FROM dept d LEFT JOIN emp e ON e.dept = d.id ORDER BY d.dname, e.id",
             join_strategy=strategy) == [("eng", 1), ("eng", 2), ("ghost", None), ("hr", None),
                                         ("ops", 3), ("ops", 5)]
    assert q(base + " WHERE d.dname IS NULL", join_strategy=strategy) == [(4, None)]
    assert q("SELECT e.id FROM emp e LEFT JOIN dept d ON d.dname = 'hr' ORDER BY e.id",
             join_strategy=strategy) == [(1,), (2,), (3,), (4,), (5,)]


# @id TEST-EXE-005 @verifies REQ-EXE-005
def test_exe_005_cross_and_no_from():
    assert q("SELECT 1 + 1, 'x'") == [(2, "x")]
    rows = q("SELECT e.id, d.id FROM emp e CROSS JOIN dept d")
    assert len(rows) == 20 and rows[:5] == [(1, 10), (1, 20), (1, 30), (1, None), (2, 10)]
    assert q("SELECT e.id, d.id FROM emp e, dept d") == rows
    assert q("SELECT COUNT(*) FROM emp, dept") == [(20,)]


# @id TEST-EXE-006 @verifies REQ-EXE-006
def test_exe_006_group_by():
    assert q("SELECT dept, COUNT(*) FROM emp GROUP BY dept") == [(10, 2), (20, 2), (None, 1)]
    assert q("SELECT dept / 10 AS g, COUNT(*) FROM emp GROUP BY dept / 10") == [(1, 2), (2, 2), (None, 1)]
    assert q("SELECT dept, name, COUNT(*) FROM emp GROUP BY dept, name") == [
        (10, "ann", 1), (10, "bob", 1), (20, "cat", 1), (None, "dan", 1), (20, "eve", 1)]
    assert q("SELECT E.DEPT FROM emp e GROUP BY dept") == [(10,), (20,), (None,)]


# @id TEST-EXE-007 @verifies REQ-EXE-007
def test_exe_007_aggregates():
    row = q("SELECT COUNT(*), COUNT(sal), SUM(sal), AVG(sal), MIN(sal), MAX(sal) FROM emp")[0]
    assert row == (5, 4, 500, 125.0, 50, 200)
    assert isinstance(row[2], int) and isinstance(row[3], float)
    assert q("SELECT COUNT(*), COUNT(sal), SUM(sal), AVG(sal), MIN(sal), MAX(sal) FROM emp WHERE sal IS NULL") == [
        (1, 0, None, None, None, None)]
    assert q("SELECT MIN(name), MAX(name) FROM emp") == [("ann", "eve")]
    assert q("SELECT SUM(sal * 1.5) FROM emp") == [(750.0,)]
    for bad in ("SELECT SUM(name) FROM emp", "SELECT AVG(name) FROM emp"):
        with pytest.raises(EvalError):
            q(bad)


# @id TEST-EXE-008 @verifies REQ-EXE-008
def test_exe_008_empty_input():
    assert q("SELECT COUNT(*), SUM(sal), MAX(sal) FROM emp WHERE id > 99") == [(0, None, None)]
    assert q("SELECT dept, COUNT(*) FROM emp WHERE id > 99 GROUP BY dept") == []
    assert q("SELECT COUNT(*) FROM emp WHERE id > 99 HAVING COUNT(*) = 0") == [(0,)]


# @id TEST-EXE-009 @verifies REQ-EXE-009
def test_exe_009_expressions_over_aggregates():
    assert q("SELECT dept, SUM(sal) / COUNT(*), dept + 1 FROM emp WHERE dept IS NOT NULL GROUP BY dept") == [
        (10, 150, 11), (20, 75, 21)]
    assert q("SELECT dept FROM emp GROUP BY dept HAVING COUNT(*) > 1 AND MAX(sal) > 150") == [(10,)]
    assert q("SELECT COUNT(*) FROM emp HAVING COUNT(*) > 100") == []
    assert q("SELECT COUNT(*) + 1, -SUM(sal) FROM emp") == [(6, -500)]
    assert q("SELECT dept, COUNT(*) AS n FROM emp GROUP BY dept ORDER BY n DESC, dept") == [
        (10, 2), (20, 2), (None, 1)]


# @id TEST-EXE-010 @verifies REQ-EXE-010
def test_exe_010_order_by():
    ids = lambda sql: [r[0] for r in q(sql)]
    assert ids("SELECT id FROM emp ORDER BY sal") == [5, 4, 1, 3, 2]
    assert ids("SELECT id FROM emp ORDER BY sal DESC") == [2, 3, 1, 4, 5]
    assert ids("SELECT id FROM emp ORDER BY dept") == [4, 1, 2, 3, 5]
    assert ids("SELECT id FROM emp ORDER BY dept, sal DESC") == [4, 2, 1, 3, 5]
    assert ids("SELECT id FROM emp ORDER BY name DESC") == [5, 4, 3, 2, 1]
    assert ids("SELECT id FROM emp ORDER BY sal * 1.0 + 0.5") == [5, 4, 1, 3, 2]
    with pytest.raises(EvalError):
        q("SELECT id FROM emp ORDER BY COALESCE(sal, 'x')")


# @id TEST-EXE-011 @verifies REQ-EXE-011
def test_exe_011_limit_offset():
    ids = lambda sql: [r[0] for r in q(sql)]
    assert ids("SELECT id FROM emp ORDER BY id LIMIT 2 OFFSET 1") == [2, 3]
    assert ids("SELECT id FROM emp ORDER BY id LIMIT 0") == []
    assert ids("SELECT id FROM emp ORDER BY id LIMIT 3 OFFSET 10") == []
    assert ids("SELECT id FROM emp ORDER BY id OFFSET 3") == [4, 5]
    assert ids("SELECT id FROM emp ORDER BY id LIMIT 99") == [1, 2, 3, 4, 5]


# @id TEST-EXE-012 @verifies REQ-EXE-012
def test_exe_012_distinct():
    assert q("SELECT DISTINCT dept FROM emp") == [(10,), (20,), (None,)]
    eng = Engine()
    eng.execute("CREATE TABLE n (x FLOAT)")
    eng.execute("INSERT INTO n VALUES (1), (1.0), (NULL), (NULL), (2)")
    assert eng.execute("SELECT DISTINCT x FROM n").rows == [(1.0,), (None,), (2.0,)]
    assert q("SELECT DISTINCT dept FROM emp ORDER BY dept DESC") == [(20,), (10,), (None,)]


# @id TEST-EXE-013 @verifies REQ-EXE-013
def test_exe_013_distinct_aggregates():
    assert q("SELECT COUNT(DISTINCT dept), COUNT(dept), SUM(DISTINCT dept) FROM emp") == [(2, 4, 30)]
    assert q("SELECT dept, COUNT(DISTINCT sal) FROM emp GROUP BY dept") == [(10, 2), (20, 1), (None, 1)]
    assert q("SELECT COUNT(DISTINCT dept) FROM emp WHERE id > 99") == [(0,)]


QUERIES = [
    "SELECT a.k, b.k FROM ta a JOIN tb b ON a.k = b.k WHERE a.v > 2 AND b.w IS NOT NULL",
    "SELECT a.id, b.id FROM ta a LEFT JOIN tb b ON a.k = b.k AND b.w > 1 WHERE a.v < 8",
    "SELECT a.id, b.id FROM ta a LEFT JOIN tb b ON a.k = b.k WHERE b.w IS NULL",
    "SELECT a.id, b.id FROM ta a LEFT JOIN tb b ON a.k = b.k WHERE b.w > 1 OR a.v = 3",
    "SELECT a.id, b.id, c.id FROM ta a, tb b, tc c WHERE a.k = b.k AND b.k = c.k AND a.v <> c.v",
    "SELECT a.id, c.id FROM ta a LEFT JOIN tb b ON a.k = b.k JOIN tc c ON c.k = b.k WHERE c.v > 1",
    "SELECT a.k, COUNT(*), SUM(b.w) FROM ta a JOIN tb b ON a.k = b.k GROUP BY a.k HAVING COUNT(*) > 1",
    "SELECT a.k, COUNT(b.w), MAX(a.v) FROM ta a LEFT JOIN tb b ON a.k = b.k WHERE a.v > 1 GROUP BY a.k",
    "SELECT DISTINCT a.k FROM ta a JOIN tb b ON a.k + 0 = b.k * 1 WHERE NOT (a.v = 4)",
    "SELECT a.id FROM ta a WHERE a.k IN (1, 2, NULL) AND a.v BETWEEN 2 AND 7",
    "SELECT a.id FROM ta a JOIN tb b ON a.k = b.k AND a.v > b.w",
    "SELECT a.id, b.id FROM ta a JOIN tb b ON a.k = b.k OR a.v = b.w",
    "SELECT a.id, b.id FROM ta a LEFT JOIN tb b ON a.k = b.k OR b.id IS NULL WHERE a.v IS NOT NULL",
    "SELECT COUNT(*) FROM ta a JOIN tb b ON 1 = 1 WHERE a.k = b.k",
    "SELECT a.id FROM ta a JOIN tb b ON a.k = b.k JOIN tc c ON b.k = c.k AND a.v > c.v WHERE 1 = 1",
    "SELECT a.id, b.id, a.f FROM ta a JOIN tb b ON a.f = b.k WHERE a.f >= 1",
]


def random_engine(seed, **kw):
    rng = random.Random(seed)
    eng = Engine(**kw)
    eng.execute("CREATE TABLE ta (id INT, k INT, v INT, f FLOAT)")
    eng.execute("CREATE TABLE tb (id INT, k INT, w INT)")
    eng.execute("CREATE TABLE tc (id INT, k INT, v INT)")
    n = lambda: rng.choice([None, 1, 2, 3, 4])
    for t, cols in (("ta", 3), ("tb", 2), ("tc", 2)):
        for i in range(rng.randint(0, 9)):
            vals = [str(i)] + [("NULL" if (x := n()) is None else str(x * (2 if c == 2 else 1)))
                               for c in range(cols)]
            if t == "ta":
                vals[3] = rng.choice(["NULL", "1", "2.0", "3.5"])
            eng.execute(f"INSERT INTO {t} VALUES ({', '.join(vals)})")
    return eng


# @id TEST-EXE-014 @verifies REQ-EXE-014
@pytest.mark.parametrize("seed", range(40))
def test_exe_014_differential(seed):
    configs = [dict(), dict(optimize=False), dict(join_strategy="nested"),
               dict(optimize=False, join_strategy="nested")]
    for sql in QUERIES:
        results = []
        for cfg in configs:
            try:
                results.append(sorted(random_engine(seed, **cfg).execute(sql).rows, key=repr))
            except SqlError as e:
                results.append(type(e).__name__)
        assert all(r == results[0] for r in results), (sql, seed, results)


# @id TEST-EXE-015 @verifies REQ-EXE-015
@pytest.mark.parametrize("sql", [
    "SELECT @ FROM emp",
    "SELECT FROM emp",
    "SELECT * FROM nope",
    "SELECT zzz FROM emp",
    "SELECT 1 / 0",
    "INSERT INTO emp VALUES (NULL, 'x', 1, 1)",
    "INSERT INTO nope VALUES (1)",
    "CREATE TABLE emp (a INT)",
    "SELECT id FROM emp WHERE name > 1",
])
def test_exe_015_errors_are_sql_errors(sql):
    with pytest.raises(SqlError):
        q(sql)
