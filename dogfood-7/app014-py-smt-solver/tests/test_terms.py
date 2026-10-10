from dataclasses import FrozenInstanceError
from fractions import Fraction
import pytest
from smt.terms import Term, Linear, Relation


# @id TEST-TERMS-001 @verifies REQ-TERMS-001
def test_terms_001():
    assert Term("f", (Term("a"),)) == Term("f", (Term("a"),))


# @id TEST-TERMS-002 @verifies REQ-TERMS-002
def test_terms_002():
    with pytest.raises(ValueError):
        Term("")
    with pytest.raises(TypeError):
        Term("f", ("a",))


# @id TEST-TERMS-003 @verifies REQ-TERMS-003
def test_terms_003():
    assert Linear({"x": "2/3", "z": 0}).coeffs == (("x", Fraction(2, 3)),)


# @id TEST-TERMS-004 @verifies REQ-TERMS-004
def test_terms_004():
    assert Linear({"x": 1}, 2) + Linear({"x": -1, "y": 3}, 1) == Linear({"y": 3}, 3)


# @id TEST-TERMS-005 @verifies REQ-TERMS-005
def test_terms_005():
    assert Linear({"x": 3}, 6) * "1/3" == Linear({"x": 1}, 2)


# @id TEST-TERMS-006 @verifies REQ-TERMS-006
def test_terms_006():
    assert [Relation(Linear({"x": 1}), op).op for op in ("le", "ge", "eq", "lt", "gt")] == ["le", "ge", "eq", "lt", "gt"]


# @id TEST-TERMS-007 @verifies REQ-TERMS-007
def test_terms_007():
    t = Term("a")
    linear = Linear({"x": 1})
    assert {t: 1}[Term("a")] == 1
    assert {linear: 2}[Linear({"x": 1})] == 2
    with pytest.raises(FrozenInstanceError):
        t.symbol = "b"


# @id TEST-TERMS-008 @verifies REQ-TERMS-008
def test_terms_008():
    with pytest.raises(TypeError):
        Linear({"x": 0.1})
    with pytest.raises(ValueError):
        Relation(Linear(), "ne")
