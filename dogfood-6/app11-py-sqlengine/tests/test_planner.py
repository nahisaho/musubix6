import pytest

from sqlengine.ast import Binary, Column, Func, Literal, Unary
from sqlengine.catalog import Catalog, Column as ColDef
from sqlengine.parser import parse
from sqlengine.plan import (Aggregate, Distinct, Filter, Join, Limit, OneRow, Project, Scan, Sort)
from sqlengine.planner import PlanError, conjoin, explain, plan, split_conjuncts


def make_catalog():
    cat = Catalog()
    cat.create_table("emp", [ColDef("id", "INT"), ColDef("Name", "TEXT"), ColDef("dept", "INT"),
                             ColDef("sal", "INT")])
    cat.create_table("dept", [ColDef("id", "INT"), ColDef("dname", "TEXT")])
    cat.create_table("proj", [ColDef("pid", "INT"), ColDef("emp_id", "INT"), ColDef("title", "TEXT")])
    return cat


CAT = make_catalog()


def P(sql, optimize=True):
    return plan(parse(sql), CAT, optimize=optimize)


def chain(node):
    out = []
    while node is not None:
        out.append(type(node).__name__)
        node = node.children[0] if node.children and type(node) is not Join else None
    return out


def E(text):
    return parse(f"SELECT {text}").items[0].expr


def col(t, n):
    return Column(t, n)


# @id TEST-PLN-001 @verifies REQ-PLN-001
def test_pln_001_node_stack():
    p = P("SELECT DISTINCT dept FROM emp WHERE sal > 1 ORDER BY dept LIMIT 3", optimize=False)
    assert chain(p) == ["Limit", "Distinct", "Project", "Sort", "Filter", "Scan"]
    p = P("SELECT dept, COUNT(*) FROM emp WHERE sal > 1 GROUP BY dept HAVING COUNT(*) > 1")
    assert chain(p) == ["Project", "Filter", "Aggregate", "Scan"][:2] + ["Aggregate", "Filter", "Scan"][0:0] \
        or chain(p) == ["Project", "Filter", "Aggregate", "Filter", "Scan"]
    assert chain(P("SELECT dept, COUNT(*) FROM emp WHERE sal > 1 GROUP BY dept HAVING COUNT(*) > 1",
                   optimize=False)) == ["Project", "Filter", "Aggregate", "Filter", "Scan"]
    assert chain(P("SELECT 1 + 1")) == ["Project", "OneRow"]
    assert chain(P("SELECT COUNT(*) FROM emp")) == ["Project", "Aggregate", "Scan"]
    j = P("SELECT * FROM emp, dept")
    assert isinstance(j.children[0], Join)


# @id TEST-PLN-002 @verifies REQ-PLN-002
@pytest.mark.parametrize("sql", [
    "SELECT * FROM nope",
    "SELECT * FROM emp e, dept e",
    "SELECT * FROM emp, EMP",
    "SELECT zzz FROM emp",
    "SELECT id FROM emp, dept",
    "SELECT x.id FROM emp",
    "SELECT * FROM emp WHERE bogus = 1",
    "SELECT d.* FROM emp",
])
def test_pln_002_bind_errors(sql):
    with pytest.raises(PlanError):
        P(sql)


# @id TEST-PLN-003 @verifies REQ-PLN-003
def test_pln_003_conjuncts():
    a, b, c, d = (col(None, x) for x in "abcd")
    e = E("a AND (b AND c) AND d")
    assert split_conjuncts(e) == [a, b, c, d]
    assert split_conjuncts(E("a OR b")) == [E("a OR b")]
    assert split_conjuncts(E("NOT (a AND b)")) == [E("NOT (a AND b)")]
    assert split_conjuncts(None) == []
    assert conjoin([]) is None and conjoin([a]) == a
    assert conjoin([a, b, c]) == Binary("AND", Binary("AND", a, b), c)


# @id TEST-PLN-004 @verifies REQ-PLN-004
def test_pln_004_pushdown_single_table():
    p = P("SELECT * FROM emp e JOIN dept d ON e.dept = d.id WHERE e.sal > 10 AND d.dname = 'x'")
    assert chain(p) == ["Project", "Join"]
    j = p.children[0]
    assert isinstance(j.left, Filter) and isinstance(j.left.child, Scan)
    assert j.left.pred == Binary(">", col("e", "sal"), Literal(10))
    assert isinstance(j.right, Filter) and j.right.pred == Binary("=", col("d", "dname"), Literal("x"))
    q = P("SELECT * FROM emp e JOIN dept d ON e.dept = d.id WHERE e.sal > 10", optimize=False)
    assert chain(q) == ["Project", "Filter", "Join"]


# @id TEST-PLN-005 @verifies REQ-PLN-005
def test_pln_005_multi_table_merge():
    p = P("SELECT * FROM emp e, dept d, proj p WHERE e.dept = d.id AND p.emp_id = e.id AND e.sal > d.id")
    top = p.children[0]
    assert isinstance(top, Join) and top.kind == "INNER"
    assert top.left.kind == "INNER"
    assert split_conjuncts(top.left.cond) == [
        Binary("=", col("e", "dept"), col("d", "id")), Binary(">", col("e", "sal"), col("d", "id"))]
    assert top.cond == Binary("=", col("p", "emp_id"), col("e", "id"))
    r = P("SELECT * FROM emp e, dept d WHERE 1 = 1 AND e.sal > 3 OR d.id = 1")
    assert chain(r) == ["Project", "Join"] and r.children[0].kind == "INNER"
    r = P("SELECT * FROM emp e, dept d WHERE e.sal > 3 OR d.id = 1", optimize=False)
    assert chain(r) == ["Project", "Filter", "Join"] and r.children[0].child.kind == "CROSS"


# @id TEST-PLN-006 @verifies REQ-PLN-006
def test_pln_006_left_join_safety():
    p = P("SELECT * FROM emp e LEFT JOIN dept d ON e.dept = d.id AND d.dname = 'x' AND e.sal > 5 "
          "WHERE d.dname IS NULL AND e.sal > 1")
    top = p.children[0]
    assert isinstance(top, Filter) and top.pred.__class__.__name__ == "IsNull"
    j = top.child
    assert j.kind == "LEFT"
    assert j.left.pred == Binary(">", col("e", "sal"), Literal(1))
    assert j.right.pred == Binary("=", col("d", "dname"), Literal("x"))
    assert isinstance(j.right.child, Scan)
    assert split_conjuncts(j.cond) == [Binary("=", col("e", "dept"), col("d", "id")),
                                       Binary(">", col("e", "sal"), Literal(5))]
    q = P("SELECT * FROM emp e LEFT JOIN dept d ON e.dept = d.id WHERE e.sal = d.id")
    assert chain(q) == ["Project", "Filter", "Join"] and q.children[0].child.kind == "LEFT"
    r = P("SELECT * FROM emp e LEFT JOIN dept d ON e.dept = d.id JOIN proj p ON p.emp_id = e.id "
          "WHERE d.dname = 'x' AND p.title = 'y'")
    assert isinstance(r.children[0], Filter) and r.children[0].pred == Binary("=", col("d", "dname"), Literal("x"))
    assert isinstance(r.children[0].child.right, Filter)


# @id TEST-PLN-007 @verifies REQ-PLN-007
def test_pln_007_constant_folding():
    p = P("SELECT * FROM emp WHERE sal > 1 + 2 * 3 AND 1 = 1 AND 'a' || 'b' = 'ab'")
    f = p.children[0]
    assert isinstance(f, Filter) and f.pred == Binary(">", col("emp", "sal"), Literal(7))
    assert chain(P("SELECT * FROM emp WHERE 2 > 1")) == ["Project", "Scan"]
    z = P("SELECT * FROM emp WHERE sal > 1 / 0")
    assert z.children[0].pred == Binary(">", col("emp", "sal"), Binary("/", Literal(1), Literal(0)))
    n = P("SELECT * FROM emp WHERE NULL = 1").children[0]
    assert isinstance(n, Filter) and n.pred == Literal(None)
    f2 = P("SELECT * FROM emp WHERE 1 = 2").children[0]
    assert f2.pred == Literal(False)
    assert P("SELECT -(1 + 2) AS x").items[0].expr == Literal(-3)
    assert chain(P("SELECT * FROM emp WHERE NOT 1 = 2")) == ["Project", "Scan"]


# @id TEST-PLN-008 @verifies REQ-PLN-008
@pytest.mark.parametrize("sql", [
    "SELECT * FROM emp WHERE COUNT(*) > 1",
    "SELECT * FROM emp e JOIN dept d ON SUM(e.sal) > 1",
    "SELECT dept FROM emp GROUP BY COUNT(*)",
    "SELECT name, COUNT(*) FROM emp GROUP BY dept",
    "SELECT dept FROM emp GROUP BY dept HAVING sal > 1",
    "SELECT dept FROM emp GROUP BY dept ORDER BY sal",
    "SELECT dept, COUNT(*) FROM emp",
    "SELECT * FROM emp GROUP BY dept",
])
def test_pln_008_aggregate_rules(sql):
    with pytest.raises(PlanError):
        P(sql)


# @id TEST-PLN-009 @verifies REQ-PLN-009
def test_pln_009_join_strategy():
    j = P("SELECT * FROM emp e JOIN dept d ON e.dept = d.id AND d.id > 1 AND e.sal + 1 = d.id * 2").children[0]
    assert j.strategy == "hash"
    assert j.keys == ((col("e", "dept"), col("d", "id")),
                      (Binary("+", col("e", "sal"), Literal(1)), Binary("*", col("d", "id"), Literal(2))))
    j = P("SELECT * FROM emp e JOIN dept d ON d.id = e.dept").children[0]
    assert j.keys == ((col("e", "dept"), col("d", "id")),) and j.residual is None
    j = P("SELECT * FROM emp e JOIN dept d ON e.sal > d.id").children[0]
    assert (j.strategy, j.keys) == ("nested", ())
    j = P("SELECT * FROM emp e JOIN dept d ON e.dept = d.id OR e.sal = d.id").children[0]
    assert j.strategy == "nested"
    j = P("SELECT * FROM emp e JOIN dept d ON e.dept = e.id + d.id").children[0]
    assert j.strategy == "nested"
    j = P("SELECT * FROM emp e CROSS JOIN dept d").children[0]
    assert j.strategy == "cross" and j.kind == "CROSS"
    j = P("SELECT * FROM emp e LEFT JOIN dept d ON e.dept = d.id AND e.sal > 2").children[0]
    assert j.strategy == "hash" and j.residual == Binary(">", col("e", "sal"), Literal(2))


# @id TEST-PLN-010 @verifies REQ-PLN-010
def test_pln_010_star_and_names():
    p = P("SELECT * FROM dept d, proj")
    assert [i.alias for i in p.items] == ["id", "dname", "pid", "emp_id", "title"]
    assert p.items[0].expr == col("d", "id")
    p = P("SELECT proj.*, d.id AS k, COUNT(*), UPPER(d.dname), 1 + 1, d.dname FROM dept d, proj GROUP BY d.id, d.dname, proj.pid, proj.emp_id, proj.title")
    assert [i.alias for i in p.items] == ["pid", "emp_id", "title", "k", "count", "upper", "?column?", "dname"]


# @id TEST-PLN-011 @verifies REQ-PLN-011
def test_pln_011_order_by_alias_ordinal():
    p = P("SELECT sal * 2 AS dbl, Name FROM emp ORDER BY dbl DESC, 2")
    srt = p.children[0]
    assert isinstance(srt, Sort)
    assert srt.keys[0].expr == Binary("*", col("emp", "sal"), Literal(2)) and srt.keys[0].desc
    assert srt.keys[1].expr == col("emp", "Name")
    for bad in ("SELECT sal FROM emp ORDER BY 2", "SELECT sal FROM emp ORDER BY 0"):
        with pytest.raises(PlanError):
            P(bad)


# @id TEST-PLN-012 @verifies REQ-PLN-012
def test_pln_012_explain():
    text = explain(P("SELECT e.name FROM emp e WHERE e.sal > 10 AND e.dept IS NOT NULL LIMIT 5"))
    assert text == (
        "Limit 5 offset 0\n"
        "  Project e.Name AS Name\n"
        "    Filter ((e.sal > 10) AND (e.dept IS NOT NULL))\n"
        "      Scan emp AS e")
    text = explain(P("SELECT COUNT(*) FROM emp e JOIN dept d ON e.dept = d.id"))
    assert text.splitlines()[0] == "Project $agg0 AS count"
    assert "Join INNER hash on e.dept = d.id" in text
    assert "Aggregate keys=[] aggs=[COUNT(*)]" in text


# @id TEST-PLN-013 @verifies REQ-PLN-013
def test_pln_013_canonical_columns():
    p = P("SELECT DEPT, COUNT(*) FROM emp e WHERE E.SAL > 1 GROUP BY e.Dept", optimize=False)
    agg = p.children[0]
    assert isinstance(agg, Aggregate)
    assert agg.group_keys == (col("e", "dept"),)
    assert p.items[0].expr == col(None, "$gk0")
    assert agg.child.pred == Binary(">", col("e", "sal"), Literal(1))
    q = P("SELECT NAME FROM emp WHERE emp.NAME = 'x'")
    assert q.items[0].expr == col("emp", "Name")
