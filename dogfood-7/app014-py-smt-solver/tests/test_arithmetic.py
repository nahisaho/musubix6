from fractions import Fraction
from smt.terms import Linear, Relation
from smt.arithmetic import feasible, simplex


def bound(coeffs, op, rhs):
    return Relation(Linear(coeffs, -Fraction(rhs)), op)


# @id TEST-ARITHMETIC-001 @verifies REQ-ARITHMETIC-001
def test_arithmetic_001():
    assert feasible([bound({"x": 1}, "ge", 3)])["x"] >= 3


# @id TEST-ARITHMETIC-002 @verifies REQ-ARITHMETIC-002
def test_arithmetic_002():
    assert feasible([bound({"x": 1}, "le", -4)])["x"] <= -4


# @id TEST-ARITHMETIC-003 @verifies REQ-ARITHMETIC-003
def test_arithmetic_003():
    assert feasible([bound({"x": 1}, "le", 1), bound({"x": 1}, "ge", 2)]) is None


# @id TEST-ARITHMETIC-004 @verifies REQ-ARITHMETIC-004
def test_arithmetic_004():
    assert feasible([bound({"x": 1}, "eq", 7)]) == {"x": Fraction(7)}


# @id TEST-ARITHMETIC-005 @verifies REQ-ARITHMETIC-005
def test_arithmetic_005():
    constraints = [bound({"x": 1, "y": 1}, "eq", 5),
                   bound({"x": 1, "y": -1}, "eq", 1)]
    assert feasible(constraints) == {"x": Fraction(3), "y": Fraction(2)}


# @id TEST-ARITHMETIC-006 @verifies REQ-ARITHMETIC-006
def test_arithmetic_006():
    assert feasible([bound({"x": 3}, "eq", 1)])["x"] == Fraction(1, 3)


# @id TEST-ARITHMETIC-007 @verifies REQ-ARITHMETIC-007
def test_arithmetic_007():
    assert feasible([]) == {}
    assert simplex([], [], [Fraction(1)])[0] == "unbounded"
    assert simplex([[Fraction(1)]], [Fraction(2)], [Fraction(1)]) == ("optimal", [Fraction(2)], Fraction(2))


# @id TEST-ARITHMETIC-008 @verifies REQ-ARITHMETIC-008
def test_arithmetic_008():
    constraints = [bound({"x": 1}, "gt", 0), bound({"x": 1}, "lt", "1/100000")]
    model = feasible(constraints)
    assert 0 < model["x"] < Fraction(1, 100000)
    assert feasible([bound({"x": 1}, "gt", 0), bound({"x": 1}, "le", 0)]) is None
