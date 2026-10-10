import pytest
from smt.sat import CDCL


def satisfies(model, clauses):
    return model is not None and all(any(model[abs(lit)] == (lit > 0) for lit in clause) for clause in clauses)


# @id TEST-SAT-001 @verifies REQ-SAT-001
def test_sat_001():
    assert CDCL(2, [[1], [-2]]).solve() == {1: True, 2: False}


# @id TEST-SAT-002 @verifies REQ-SAT-002
def test_sat_002():
    assert CDCL(3, [[1], [-1, 2], [-2, 3]]).solve() == {1: True, 2: True, 3: True}


# @id TEST-SAT-003 @verifies REQ-SAT-003
def test_sat_003():
    assert CDCL(1, [[1], [-1]]).solve() is None


# @id TEST-SAT-004 @verifies REQ-SAT-004
def test_sat_004():
    clauses = [[1, 2], [-1, 3], [-2, -3]]
    assert satisfies(CDCL(3, clauses).solve(), clauses)


# @id TEST-SAT-005 @verifies REQ-SAT-005
def test_sat_005():
    clauses = [[-1, 2], [-1, -2], [1, 3]]
    solver = CDCL(3, clauses)
    assert satisfies(solver.solve(), clauses)
    assert solver.stats["backjumps"] >= 1


# @id TEST-SAT-006 @verifies REQ-SAT-006
def test_sat_006():
    solver = CDCL(2, [[1, 2], [1, -2], [-1, 2], [-1, -2]])
    assert solver.solve() is None
    assert solver.stats["learned"] >= 1


# @id TEST-SAT-007 @verifies REQ-SAT-007
def test_sat_007():
    assert CDCL(0, []).solve() == {}
    assert CDCL(0, [[]]).solve() is None


# @id TEST-SAT-008 @verifies REQ-SAT-008
def test_sat_008():
    for lit in (0, 2, 1.0, True):
        with pytest.raises(ValueError):
            CDCL(1, [[lit]])
