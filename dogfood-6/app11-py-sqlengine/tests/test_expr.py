import pytest

from sqlengine.expr import EvalError, Scope, evaluate, is_true
from sqlengine.parser import parse

T, F, U = True, False, None


def ev(text, cols=(), row=()):
    node = parse(f"SELECT {text}").items[0].expr
    return evaluate(node, Scope(list(cols)), tuple(row))


# @id TEST-EXP-001 @verifies REQ-EXP-001
@pytest.mark.parametrize("text", ["NULL + 1", "1 - NULL", "NULL * NULL", "NULL / 2", "2 % NULL", "-NULL"])
def test_exp_001_null_arithmetic(text):
    assert ev(text) is None
    assert ev("1 + 2 * 3 - 4") == 3
    assert ev("1.5 + 1") == 2.5 and ev("-(2)") == -2


# @id TEST-EXP-002 @verifies REQ-EXP-002
def test_exp_002_int_division():
    assert ev("7 / 2") == 3 and ev("-7 / 2") == -3 and ev("7 / -2") == -3
    assert ev("7 % 3") == 1 and ev("-7 % 3") == -1 and ev("7 % -3") == 1
    assert ev("7.0 / 2") == 3.5
    for bad in ("1 / 0", "1 % 0", "1.5 / 0"):
        with pytest.raises(EvalError):
            ev(bad)


# @id TEST-EXP-003 @verifies REQ-EXP-003
def test_exp_003_comparison():
    assert ev("1 < 2") is T and ev("2 <= 2.0") is T and ev("1.5 > 1") is T
    assert ev("'a' < 'b'") is T and ev("'a' = 'a'") is T and ev("1 <> 2") is T
    assert ev("TRUE = TRUE") is T and ev("FALSE < TRUE") is T
    for text in ("NULL = 1", "1 = NULL", "NULL = NULL", "NULL <> NULL", "NULL < 'a'"):
        assert ev(text) is U
    for bad in ("1 = 'a'", "TRUE = 1", "'a' < 2"):
        with pytest.raises(EvalError):
            ev(bad)


# @id TEST-EXP-004 @verifies REQ-EXP-004
def test_exp_004_and_table():
    expected = {(T, T): T, (T, F): F, (T, U): U, (F, T): F, (F, F): F, (F, U): F,
                (U, T): U, (U, F): F, (U, U): U}
    lit = {T: "TRUE", F: "FALSE", U: "NULL"}
    for (a, b), want in expected.items():
        assert ev(f"{lit[a]} AND {lit[b]}") is want, (a, b)


# @id TEST-EXP-005 @verifies REQ-EXP-005
def test_exp_005_or_table():
    expected = {(T, T): T, (T, F): T, (T, U): T, (F, T): T, (F, F): F, (F, U): U,
                (U, T): T, (U, F): U, (U, U): U}
    lit = {T: "TRUE", F: "FALSE", U: "NULL"}
    for (a, b), want in expected.items():
        assert ev(f"{lit[a]} OR {lit[b]}") is want, (a, b)


# @id TEST-EXP-006 @verifies REQ-EXP-006
def test_exp_006_not_and_types():
    assert ev("NOT TRUE") is F and ev("NOT FALSE") is T and ev("NOT NULL") is U
    for bad in ("NOT 1", "1 AND TRUE", "FALSE OR 'x'", "TRUE AND 1"):
        with pytest.raises(EvalError):
            ev(bad)


# @id TEST-EXP-007 @verifies REQ-EXP-007
def test_exp_007_is_null():
    assert ev("NULL IS NULL") is T and ev("1 IS NULL") is F
    assert ev("NULL IS NOT NULL") is F and ev("0 IS NOT NULL") is T
    assert ev("(NULL = NULL) IS NULL") is T


# @id TEST-EXP-008 @verifies REQ-EXP-008
def test_exp_008_in_list():
    assert ev("1 IN (1, 2)") is T and ev("3 IN (1, 2)") is F
    assert ev("3 IN (1, NULL)") is U and ev("1 IN (1, NULL)") is T
    assert ev("NULL IN (1, 2)") is U and ev("NULL IN (NULL)") is U
    assert ev("3 NOT IN (1, 2)") is T and ev("3 NOT IN (1, NULL)") is U
    assert ev("1 NOT IN (1, NULL)") is F and ev("NULL NOT IN (1)") is U
    assert ev("1 IN (1.0)") is T


# @id TEST-EXP-009 @verifies REQ-EXP-009
def test_exp_009_between():
    assert ev("5 BETWEEN 1 AND 10") is T and ev("1 BETWEEN 1 AND 10") is T
    assert ev("11 BETWEEN 1 AND 10") is F and ev("5 BETWEEN 10 AND 1") is F
    assert ev("5 NOT BETWEEN 1 AND 3") is T
    assert ev("NULL BETWEEN 1 AND 2") is U
    assert ev("5 BETWEEN NULL AND 10") is U
    assert ev("50 BETWEEN NULL AND 10") is F  # x <= hi is FALSE, FALSE AND UNKNOWN = FALSE
    assert ev("50 NOT BETWEEN NULL AND 10") is T


# @id TEST-EXP-010 @verifies REQ-EXP-010
def test_exp_010_like():
    assert ev("'hello' LIKE 'h%o'") is T and ev("'hello' LIKE 'h_llo'") is T
    assert ev("'hello' LIKE 'hell'") is F and ev("'hello' LIKE '%'") is T
    assert ev("'a.c' LIKE 'a.c'") is T and ev("'abc' LIKE 'a.c'") is F
    assert ev("'a+b' LIKE 'a+b'") is T and ev("'(x)' LIKE '(x)'") is T
    assert ev("'a\nb' LIKE 'a_b'") is T and ev("'' LIKE '%'") is T
    assert ev("'abc' NOT LIKE 'a%'") is F
    assert ev("NULL LIKE 'a'") is U and ev("'a' LIKE NULL") is U and ev("NULL NOT LIKE 'a'") is U
    with pytest.raises(EvalError):
        ev("1 LIKE '1'")


# @id TEST-EXP-011 @verifies REQ-EXP-011
def test_exp_011_concat():
    assert ev("'a' || 'b' || 'c'") == "abc"
    assert ev("'a' || NULL") is None and ev("NULL || 'a'") is None
    with pytest.raises(EvalError):
        ev("'a' || 1")


# @id TEST-EXP-012 @verifies REQ-EXP-012
def test_exp_012_column_resolution():
    cols = [("a", "id"), ("b", "id"), ("a", "Name")]
    row = (1, 2, "n")
    assert ev("a.id", cols, row) == 1 and ev("B.ID", cols, row) == 2
    assert ev("name", cols, row) == "n" and ev("a.NAME", cols, row) == "n"
    with pytest.raises(EvalError, match="ambiguous"):
        ev("id", cols, row)
    for bad in ("zzz", "c.id", "b.name"):
        with pytest.raises(EvalError):
            ev(bad, cols, row)
    assert Scope(cols).resolve("a", "id") == 0


# @id TEST-EXP-013 @verifies REQ-EXP-013
def test_exp_013_functions():
    assert ev("UPPER('aB')") == "AB" and ev("lower('aB')") == "ab" and ev("LENGTH('abc')") == 3
    assert ev("ABS(-3)") == 3 and ev("ABS(-2.5)") == 2.5
    assert ev("COALESCE(NULL, NULL, 3, 4)") == 3 and ev("COALESCE(NULL, NULL)") is None
    assert ev("NULLIF(1, 1)") is None and ev("NULLIF(1, 2)") == 1 and ev("NULLIF(NULL, 1)") is None
    for f in ("UPPER", "LOWER", "LENGTH", "ABS"):
        assert ev(f"{f}(NULL)") is None
    for bad in ("FOO(1)", "UPPER()", "UPPER('a','b')", "ABS('x')", "NULLIF(1)", "COUNT(1)"):
        with pytest.raises(EvalError):
            ev(bad)


# @id TEST-EXP-014 @verifies REQ-EXP-014
def test_exp_014_short_circuit_and_is_true():
    assert ev("FALSE AND 1 / 0 = 1") is F
    assert ev("TRUE OR 1 / 0 = 1") is T
    with pytest.raises(EvalError):
        ev("TRUE AND 1 / 0 = 1")
    with pytest.raises(EvalError):
        ev("FALSE OR 1 / 0 = 1")
    assert [is_true(v) for v in (True, False, None, 1, "x")] == [True, False, False, False, False]
