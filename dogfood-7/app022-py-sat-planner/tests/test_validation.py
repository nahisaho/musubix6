import json
from planner.model import Action, Task
from planner.validation import validate, main
from tests.support import chain, DOMAIN, PROBLEM


# @id TEST-VAL-001 @verifies REQ-VAL-001 REQ-VAL-002 REQ-VAL-003 REQ-VAL-004
def test_val_001():
    t = chain()
    v = validate(t, ("first", "second"))
    assert v.valid and v.cost == 2 and ("g",) in v.state
    v = validate(t, ("missing",))
    assert not v.valid and v.step == 0 and "unknown" in v.reason
    v = validate(t, ("second",))
    assert not v.valid and v.step == 0 and "precondition" in v.reason
    assert not validate(t, ("first",)).valid


# @id TEST-VAL-002 @verifies REQ-VAL-005 REQ-VAL-006 REQ-VAL-007 REQ-VAL-008
def test_val_002(capsys):
    assert validate(Task((), frozenset(), frozenset()), ()).cost == 0
    assert main(["examples/transport.domain", "examples/trip.problem"]) == 0
    result = json.loads(capsys.readouterr().out)
    assert result["status"] == "solved" and result["valid"] and result["cost"] == 2
    assert main(["examples/transport.domain", "examples/blocked.problem"]) == 1
    assert json.loads(capsys.readouterr().out)["status"] == "unsolvable"
    assert main(["examples/transport.domain", "examples/trip.problem", "--limit", "0"]) == 3
    assert json.loads(capsys.readouterr().out)["status"] == "limit"
    assert main(["examples/bad.domain", "examples/trip.problem"]) == 2
    assert "error" in json.loads(capsys.readouterr().out)


# @id TEST-VAL-003 @verifies REQ-VAL-009
def test_val_003():
    task = Task((Action("same", add={("g",)}), Action("same")), frozenset(), frozenset({("g",)}))
    result = validate(task, ("same",))
    assert not result.valid and "ambiguous" in result.reason
