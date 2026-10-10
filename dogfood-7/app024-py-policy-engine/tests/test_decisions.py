import copy
import pytest
from policy.engine import decide

# @id TEST-DECISIONS-001 @verifies REQ-DECISIONS-001
def test_decisions_001():
    result = decide([{"id": "adult", "effect": "Permit", "when": "subject.age >= 18"}], {"subject": {"age": 20}})
    assert (result["decision"], result["authorized"]) == ("Permit", True)

# @id TEST-DECISIONS-002 @verifies REQ-DECISIONS-002
def test_decisions_002():
    result = decide([{"id": "adult", "effect": "Permit", "when": "False"}], {})
    assert (result["decision"], result["authorized"]) == ("NotApplicable", False)

# @id TEST-DECISIONS-003 @verifies REQ-DECISIONS-003
def test_decisions_003():
    result = decide([{"id": "adult", "effect": "Permit", "when": "subject.age >= 18"}], {})
    assert (result["decision"], result["authorized"]) == ("Indeterminate", False)
    rules = [{"id": "p", "effect": "Permit"}, {"id": "d", "effect": "Deny", "when": "subject.age >= 18"}]
    for algorithm, expected in [("deny-overrides", "Indeterminate"), ("permit-overrides", "Permit"), ("first-applicable", "Permit"), ("only-one-applicable", "Indeterminate")]:
        assert decide(rules, {}, algorithm)["decision"] == expected

# @id TEST-DECISIONS-004 @verifies REQ-DECISIONS-004
def test_decisions_004():
    rule = {"id": "r", "effect": "Permit", "roles": ["reader"]}
    assert decide([rule], {"subject": {"roles": ["admin"]}}, hierarchy={"admin": ["reader"], "reader": []})["authorized"] is True
    assert decide([rule], {"subject": {"roles": []}}, hierarchy={"reader": []})["authorized"] is False

# @id TEST-DECISIONS-005 @verifies REQ-DECISIONS-005
def test_decisions_005():
    result = decide([{"id": "a", "effect": "Permit", "when": "subject.age >= 18"}, {"id": "b", "effect": "Deny", "when": "False"}], {"subject": {"age": 989898}})
    assert result["trace"] == [{"id": "a", "outcome": "Permit", "reason": "condition matched"}, {"id": "b", "outcome": "NotApplicable", "reason": "condition false"}]
    assert "989898" not in str(result)

# @id TEST-DECISIONS-006 @verifies REQ-DECISIONS-006
def test_decisions_006():
    result = decide([{"id": "a", "effect": "Permit", "obligations": ["audit"]}, {"id": "b", "effect": "Deny", "obligations": ["block", "audit", "block"]}], {})
    assert result["decision"] == "Deny" and result["obligations"] == ["block", "audit"]

# @id TEST-DECISIONS-007 @verifies REQ-DECISIONS-007
def test_decisions_007():
    for rules in [[{"id": "a", "effect": "Permit"}, {"id": "a", "effect": "Deny"}], [{"id": "a", "effect": "Allow"}]]:
        with pytest.raises(ValueError):
            decide(rules, {})

# @id TEST-DECISIONS-008 @verifies REQ-DECISIONS-008
def test_decisions_008():
    rules = [{"id": "a", "effect": "Permit", "obligations": ["audit"]}]
    request = {"subject": {"roles": ["reader"]}}
    before = copy.deepcopy((rules, request))
    result = decide(rules, request)
    result["obligations"].append("changed")
    assert (rules, request) == before

# @id TEST-DECISIONS-009 @verifies REQ-DECISIONS-009
def test_decisions_009():
    rule = {"id": "guard", "effect": "Permit", "roles": ["a"]}
    hierarchy = {letter: [] for letter in "admin"}
    for subject in [None, [], {"roles": "admin"}, {"roles": None}, {"roles": [[]]}]:
        result = decide([rule], {"subject": subject}, hierarchy=hierarchy)
        assert (result["decision"], result["authorized"]) == ("Indeterminate", False)
        assert result["trace"][0]["reason"] == "evaluation failed"
