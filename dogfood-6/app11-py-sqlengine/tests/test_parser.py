import pytest

from sqlengine.ast import (Between, Binary, Column, ColumnDef, CreateTable, Func, Insert,
                           InList, IsNull, Join, Like, Literal, Select, SelectItem, Star,
                           TableRef, Unary)
from sqlengine.parser import parse, ParseError


def expr(text):
    return parse(f"SELECT {text}").items[0].expr


def c(name, table=None):
    return Column(table, name)


def lit(v):
    return Literal(v)


# @id TEST-PAR-001 @verifies REQ-PAR-001
def test_par_001_select_list():
    s = parse("SELECT a, b AS x, c y, *, t.* FROM t")
    assert s.items == (
        SelectItem(c("a"), None), SelectItem(c("b"), "x"), SelectItem(c("c"), "y"),
        SelectItem(Star(None), None), SelectItem(Star("t"), None))
    assert s.from_ == TableRef("t", None)


# @id TEST-PAR-002 @verifies REQ-PAR-002
def test_par_002_from_and_joins():
    s = parse("SELECT 1 FROM a x JOIN b ON x.i = b.i LEFT OUTER JOIN c AS z ON TRUE "
              "INNER JOIN d ON 1 = 1 CROSS JOIN e, f LEFT JOIN g ON FALSE")
    assert s.from_ == TableRef("a", "x")
    assert [(j.kind, j.table) for j in s.joins] == [
        ("INNER", TableRef("b", None)), ("LEFT", TableRef("c", "z")), ("INNER", TableRef("d", None)),
        ("CROSS", TableRef("e", None)), ("CROSS", TableRef("f", None)), ("LEFT", TableRef("g", None))]
    assert s.joins[0].on == Binary("=", c("i", "x"), c("i", "b"))
    assert s.joins[3].on is None
    assert parse("SELECT 1").from_ is None


# @id TEST-PAR-003 @verifies REQ-PAR-003
def test_par_003_precedence():
    assert expr("a OR b AND NOT c = 1 + 2 * -3") == Binary(
        "OR", c("a"),
        Binary("AND", c("b"), Unary("NOT", Binary(
            "=", c("c"), Binary("+", lit(1), Binary("*", lit(2), Unary("-", lit(3))))))))
    assert expr("a || b + 1") == Binary("+", Binary("||", c("a"), c("b")), lit(1))


# @id TEST-PAR-004 @verifies REQ-PAR-004
def test_par_004_associativity_parens():
    assert expr("a - b - c") == Binary("-", Binary("-", c("a"), c("b")), c("c"))
    assert expr("a / b % c") == Binary("%", Binary("/", c("a"), c("b")), c("c"))
    assert expr("a - (b - c)") == Binary("-", c("a"), Binary("-", c("b"), c("c")))
    assert expr("a < b < c") == Binary("<", Binary("<", c("a"), c("b")), c("c"))
    assert expr("- - 1") == Unary("-", Unary("-", lit(1)))


# @id TEST-PAR-005 @verifies REQ-PAR-005
def test_par_005_predicates():
    assert expr("a IS NULL") == IsNull(c("a"), False)
    assert expr("a IS NOT NULL") == IsNull(c("a"), True)
    assert expr("a NOT IN (1, 2)") == InList(c("a"), (lit(1), lit(2)), True)
    assert expr("a IN (1)") == InList(c("a"), (lit(1),), False)
    assert expr("a BETWEEN 1 AND 2 AND b") == Binary(
        "AND", Between(c("a"), lit(1), lit(2), False), c("b"))
    assert expr("a NOT BETWEEN 1 + 1 AND 5") == Between(
        c("a"), Binary("+", lit(1), lit(1)), lit(5), True)
    assert expr("a LIKE 'x%'") == Like(c("a"), lit("x%"), False)
    assert expr("a NOT LIKE 'x'") == Like(c("a"), lit("x"), True)


# @id TEST-PAR-006 @verifies REQ-PAR-006
def test_par_006_functions():
    assert expr("count(*)") == Func("COUNT", (), True, False)
    assert expr("COUNT(DISTINCT a)") == Func("COUNT", (c("a"),), False, True)
    assert expr("coalesce(a, 1, NULL)") == Func("COALESCE", (c("a"), lit(1), lit(None)), False, False)
    assert expr("now()") == Func("NOW", (), False, False)


# @id TEST-PAR-007 @verifies REQ-PAR-007
def test_par_007_clauses():
    s = parse("SELECT DISTINCT a FROM t WHERE a > 1 GROUP BY a, b HAVING COUNT(*) > 1 "
              "ORDER BY a DESC, b ASC, c LIMIT 5 OFFSET 2;")
    assert s.distinct is True
    assert s.where == Binary(">", c("a"), lit(1))
    assert s.group_by == (c("a"), c("b"))
    assert s.having == Binary(">", Func("COUNT", (), True, False), lit(1))
    assert [(o.expr, o.desc) for o in s.order_by] == [(c("a"), True), (c("b"), False), (c("c"), False)]
    assert (s.limit, s.offset) == (5, 2)
    assert parse("SELECT a").distinct is False


# @id TEST-PAR-008 @verifies REQ-PAR-008
@pytest.mark.parametrize("sql,pos", [
    ("SELECT a FROM", 13),
    ("SELECT a b c", 11),
    ("SELECT a FROM t; x", 17),
    ("SELECT (a", 9),
    ("SELECT a FROM t WHERE", 21),
    ("SELECT a LIMIT x", 15),
    ("FROB", 0),
])
def test_par_008_errors(sql, pos):
    with pytest.raises(ParseError) as e:
        parse(sql)
    assert e.value.pos == pos


# @id TEST-PAR-009 @verifies REQ-PAR-009
def test_par_009_create_table():
    s = parse("CREATE TABLE t (id INT NOT NULL, name text, ok Bool NOT NULL, f FLOAT)")
    assert s == CreateTable("t", (ColumnDef("id", "INT", True), ColumnDef("name", "TEXT", False),
                                  ColumnDef("ok", "BOOL", True), ColumnDef("f", "FLOAT", False)))
    with pytest.raises(ParseError):
        parse("CREATE TABLE t ()")


# @id TEST-PAR-010 @verifies REQ-PAR-010
def test_par_010_insert():
    s = parse("INSERT INTO t VALUES (1, 'a', NULL, TRUE), (-2, 'b', FALSE, 1.5)")
    assert s == Insert("t", (
        (lit(1), lit("a"), lit(None), lit(True)),
        (Unary("-", lit(2)), lit("b"), lit(False), lit(1.5))))
