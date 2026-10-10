import pytest
from regexc.api import compile_pattern, StepLimitError


# @id TEST-ASSERTIONS-001
# @verifies REQ-ASSERTIONS-001 REQ-ASSERTIONS-002
def test_assertions_001():
    assert compile_pattern("a(?=b)b").fullmatch("ab").group() == "ab"
    assert compile_pattern(r"(?=(ab))\1").fullmatch("ab").group(1) == "ab"


# @id TEST-ASSERTIONS-002
# @verifies REQ-ASSERTIONS-003 REQ-ASSERTIONS-004
def test_assertions_002():
    assert compile_pattern("a(?!b).").fullmatch("ab") is None
    assert compile_pattern("a(?!b).").fullmatch("ac") is not None
    assert compile_pattern("(?!((a)c))ab").fullmatch("ab").group(2) is None


# @id TEST-ASSERTIONS-003
# @verifies REQ-ASSERTIONS-005 REQ-ASSERTIONS-006
def test_assertions_003():
    assert compile_pattern("(?<=ab)c").search("abc").span() == (2, 3)
    assert compile_pattern("(?<!ab)c").search("c").span() == (0, 1)
    assert compile_pattern("(?<!ab)c").search("abc") is None


# @id TEST-ASSERTIONS-004
# @verifies REQ-ASSERTIONS-007 REQ-ASSERTIONS-008
def test_assertions_004():
    for pattern in ["(?<=a+)b", "(?<=a|bc)d", r"(a)(?<=\1)b"]:
        with pytest.raises(ValueError):
            compile_pattern(pattern)
    assert compile_pattern("(?<=ab|cd)e").search("cde").span() == (2, 3)


# @id TEST-ASSERTIONS-005
# @verifies REQ-ASSERTIONS-009 REQ-ASSERTIONS-010
def test_assertions_005():
    assert compile_pattern(r"^\b漢\b$").fullmatch("漢") is not None
    assert compile_pattern(r"\B").match("漢", pos=0) is None
    assert compile_pattern("a$").search("a\n") is None
    assert compile_pattern("(?=(?=a)a)a").fullmatch("a") is not None
    with pytest.raises(StepLimitError):
        compile_pattern("(?=(?=a)a)a").fullmatch("a", step_limit=2)
