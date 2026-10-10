import json
import subprocess
import sys
import pytest
from smt.terms import Linear, Relation, Term
from smt.solver import Solver


def relation(op, rhs):
    return Relation(Linear({"x": 1}, -rhs), op)


# @id TEST-SOLVER-001 @verifies REQ-SOLVER-001
def test_solver_001():
    s = Solver()
    p, q = s.atom("p"), s.atom("q")
    s.add_clause([p, q])
    s.add_clause([-p])
    result = s.check()
    assert result.status == "sat"
    assert result.boolean[q] and not result.boolean[p]


# @id TEST-SOLVER-002 @verifies REQ-SOLVER-002
def test_solver_002():
    s = Solver()
    eq = s.atom(relation("eq", 0))
    low = s.atom(relation("ge", 0))
    s.add_clause([-eq])
    s.add_clause([low])
    result = s.check()
    assert result.status == "sat" and result.arithmetic["x"] > 0


# @id TEST-SOLVER-003 @verifies REQ-SOLVER-003
def test_solver_003():
    s = Solver()
    a, b = Term("a"), Term("b")
    ab = s.atom((a, b))
    fab = s.atom((Term("f", (a,)), Term("f", (b,))))
    s.add_clause([ab])
    s.add_clause([-fab])
    assert s.check().status == "unsat"


# @id TEST-SOLVER-004 @verifies REQ-SOLVER-004
def test_solver_004():
    s = Solver()
    low, high = s.atom(relation("le", 0)), s.atom(relation("ge", 1))
    s.add_clause([low, high])
    s.add_clause([high])
    result = s.check()
    assert result.status == "sat" and result.arithmetic["x"] >= 1
    assert result.stats["theory_conflicts"] >= 1
    s.add_clause([low])
    assert s.check().status == "unsat"
    empty = Solver()
    empty.add_clause([])
    result = empty.check()
    assert result.status == "unsat" and result.boolean is None


# @id TEST-SOLVER-005 @verifies REQ-SOLVER-005
def test_solver_005():
    s = Solver()
    a, b = Term("a"), Term("b")
    s.add_clause([s.atom((a, b))])
    s.add_clause([s.atom(relation("eq", 2))])
    result = s.check()
    assert result.status == "sat" and result.arithmetic["x"] == 2
    assert result.euf.equal(a, b)


# @id TEST-SOLVER-006 @verifies REQ-SOLVER-006
def test_solver_006():
    s = Solver()
    p = s.atom("p")
    s.add_clause([p])
    s.push()
    s.add_clause([-p])
    assert s.check().status == "unsat"
    s.pop()
    assert s.check().status == "sat"
    with pytest.raises(ValueError):
        s.pop()


# @id TEST-SOLVER-007 @verifies REQ-SOLVER-007
def test_solver_007():
    s = Solver()
    result = s.check(budget=0)
    assert result.status == "unknown" and result.boolean is None


# @id TEST-SOLVER-008 @verifies REQ-SOLVER-008
def test_solver_008():
    payload = {"atoms": [{"kind": "lra", "coeffs": {"x": 3}, "op": "eq", "rhs": 1},
                         {"kind": "euf", "left": "a", "right": "b"}],
               "clauses": [[1], [2]]}
    run = subprocess.run([sys.executable, "-m", "smt"], input=json.dumps(payload),
                         text=True, capture_output=True, check=True)
    result = json.loads(run.stdout)
    assert result["status"] == "sat" and result["arithmetic"]["x"] == "1/3"
    assert result["euf"]["classes"]["a"] == result["euf"]["classes"]["b"]


# @id TEST-SOLVER-009 @verifies REQ-SOLVER-009
def test_solver_009():
    payload = {"atoms": [{"kind": "bool", "name": "p"}, {"kind": "bool", "name": "p"}],
               "clauses": [[1], [-2]]}
    run = subprocess.run([sys.executable, "-m", "smt"], input=json.dumps(payload),
                         text=True, capture_output=True)
    assert run.returncode == 0
    assert json.loads(run.stdout)["status"] == "unsat"
    payload["clauses"] = [[3]]
    run = subprocess.run([sys.executable, "-m", "smt"], input=json.dumps(payload),
                         text=True, capture_output=True)
    assert run.returncode == 2 and json.loads(run.stdout)["status"] == "error"


# @id TEST-SOLVER-010 @verifies REQ-SOLVER-010
def test_solver_010():
    for fields in ({"rhs": "1/0"}, {"coeffs": {"x": "1/0"}}):
        payload = {"atoms": [{"kind": "lra", "op": "eq", **fields}]}
        run = subprocess.run([sys.executable, "-m", "smt"], input=json.dumps(payload),
                             text=True, capture_output=True)
        assert run.returncode == 2 and not run.stderr
        assert json.loads(run.stdout)["status"] == "error"


# @id TEST-SOLVER-011 @verifies REQ-SOLVER-011
def test_solver_011():
    payload = {"atoms": [{"kind": "euf", "left": "f(a)",
                         "right": {"symbol": "f", "args": ["a"]}}],
               "clauses": [[-1]]}
    run = subprocess.run([sys.executable, "-m", "smt"], input=json.dumps(payload),
                         text=True, capture_output=True, check=True)
    model = json.loads(run.stdout)["euf"]
    assert "terms" in model
    records = {json.dumps(entry["term"], sort_keys=True): entry["value"]
               for entry in model["terms"]}
    assert len(records) == 3
    constant = json.dumps({"symbol": "f(a)", "args": []}, sort_keys=True)
    application = json.dumps({"symbol": "f", "args": [{"symbol": "a", "args": []}]}, sort_keys=True)
    assert records[constant] != records[application]
