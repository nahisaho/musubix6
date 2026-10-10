import pytest
from policy.dsl import parse, evaluate

# @id TEST-DSL-001 @verifies REQ-DSL-001
def test_dsl_001():
    assert parse('subject.age == 18') == ("cmp", "eq", ("path", "subject.age"), ("lit", 18))

# @id TEST-DSL-002 @verifies REQ-DSL-002
def test_dsl_002():
    assert parse("True or False and False") == ("or", ("lit", True), ("and", ("lit", False), ("lit", False)))

# @id TEST-DSL-003 @verifies REQ-DSL-003
def test_dsl_003():
    assert evaluate(parse("subject.age >= 18"), {"subject": {"age": 21}}) is True

# @id TEST-DSL-004 @verifies REQ-DSL-004
def test_dsl_004():
    assert evaluate(parse('action.name in ["read", "list"]'), {"action": {"name": "read"}}) is True

# @id TEST-DSL-005 @verifies REQ-DSL-005
def test_dsl_005():
    with pytest.raises(ValueError, match="missing attribute"):
        evaluate(parse("subject.age == 18"), {})

# @id TEST-DSL-006 @verifies REQ-DSL-006
def test_dsl_006():
    for text in ['__import__("os")', "subject.__class__ == 1", "open('x')", "other.age == 1", "[x for x in []]"]:
        with pytest.raises(ValueError):
            parse(text)

# @id TEST-DSL-007 @verifies REQ-DSL-007
def test_dsl_007():
    assert evaluate(parse("False and subject.missing == 1"), {}) is False
    assert evaluate(parse("True or subject.missing == 1"), {}) is True

# @id TEST-DSL-008 @verifies REQ-DSL-008
def test_dsl_008():
    with pytest.raises(ValueError, match="too complex"):
        parse(" and ".join(["True"] * 300))
