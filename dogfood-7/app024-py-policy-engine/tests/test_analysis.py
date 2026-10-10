import pytest
from policy.analysis import analyze

# @id TEST-ANALYSIS-001 @verifies REQ-ANALYSIS-001
def test_analysis_001():
    assert analyze([{"id": "a", "effect": "Permit", "when": "subject.age == 18"}, {"id": "b", "effect": "Deny", "when": "subject.age == 18"}]) == [{"kind": "conflict", "rules": ["a", "b"], "certainty": "definite"}]
    for expression in ["False", "subject.age == 18 and subject.age == 19"]:
        assert analyze([{"id": "a", "effect": "Permit", "when": expression}, {"id": "b", "effect": "Deny", "when": expression}]) == []

# @id TEST-ANALYSIS-002 @verifies REQ-ANALYSIS-002
def test_analysis_002():
    assert analyze([{"id": "a", "effect": "Permit", "when": "subject.age == 18"}, {"id": "b", "effect": "Deny", "when": "subject.age == 19"}]) == []

# @id TEST-ANALYSIS-003 @verifies REQ-ANALYSIS-003
def test_analysis_003():
    assert analyze([{"id": "a", "effect": "Permit", "when": "subject.age == 18"}, {"id": "b", "effect": "Deny", "when": 'subject.age == 18 and resource.owner == "bob"'}])[0]["certainty"] == "definite"

# @id TEST-ANALYSIS-004 @verifies REQ-ANALYSIS-004
def test_analysis_004():
    assert analyze([{"id": "a", "effect": "Permit", "when": "subject.age > 18"}, {"id": "b", "effect": "Deny", "when": "subject.age < 65"}])[0]["certainty"] == "possible"

# @id TEST-ANALYSIS-005 @verifies REQ-ANALYSIS-005
def test_analysis_005():
    assert {"kind": "shadowed", "rules": ["a", "b"], "certainty": "definite"} in analyze([{"id": "a", "effect": "Permit"}, {"id": "b", "effect": "Deny", "when": "False"}], "first-applicable")

# @id TEST-ANALYSIS-006 @verifies REQ-ANALYSIS-006
def test_analysis_006():
    assert analyze([{"id": "a", "effect": "Permit"}, {"id": "b", "effect": "Permit"}]) == [{"kind": "duplicate", "rules": ["a", "b"], "certainty": "definite"}]

# @id TEST-ANALYSIS-007 @verifies REQ-ANALYSIS-007
def test_analysis_007():
    assert [d["rules"] for d in analyze([{"id": "a", "effect": "Permit"}, {"id": "b", "effect": "Deny"}, {"id": "c", "effect": "Permit"}])] == [["a", "b"], ["a", "c"], ["b", "c"]]

# @id TEST-ANALYSIS-008 @verifies REQ-ANALYSIS-008
def test_analysis_008():
    with pytest.raises(ValueError):
        analyze([{"id": "a", "effect": "Permit", "when": "danger()"}])

# @id TEST-ANALYSIS-009 @verifies REQ-ANALYSIS-009
def test_analysis_009():
    for left, right in [
        ("subject.x == 1 and subject.x.y == 2", "True"),
        ("subject.x == 1", "subject.x.y == 2"),
        ("subject.x.y == 2", "subject.x == 1"),
    ]:
        assert analyze([{"id": "a", "effect": "Permit", "when": left}, {"id": "b", "effect": "Deny", "when": right}]) == []
