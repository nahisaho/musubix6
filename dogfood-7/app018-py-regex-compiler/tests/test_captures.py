import pytest
from regexc.api import compile_pattern


# @id TEST-CAPTURES-001
# @verifies REQ-CAPTURES-001 REQ-CAPTURES-002
def test_captures_001():
    m = compile_pattern("(a(b))c").fullmatch("abc")
    assert m.groups() == ("ab", "b")
    assert m.span(1) == (0, 2)
    assert m.span(2) == (1, 2)


# @id TEST-CAPTURES-002
# @verifies REQ-CAPTURES-003 REQ-CAPTURES-004
def test_captures_002():
    assert compile_pattern(r"(ab)\1").fullmatch("abab") is not None
    assert compile_pattern(r"(ab)\1").fullmatch("abac") is None
    assert compile_pattern(r"(a)?\1").fullmatch("") is None
    for pattern in [r"\1(a)", r"(a)\2", r"(\1)"]:
        with pytest.raises(ValueError):
            compile_pattern(pattern)


# @id TEST-CAPTURES-003
# @verifies REQ-CAPTURES-005 REQ-CAPTURES-006
def test_captures_003():
    m = compile_pattern(r"(?P<word>\w+)-(?P=word)").fullmatch("漢-漢")
    assert m.group("word") == "漢"
    assert m.groupdict() == {"word": "漢"}
    for pattern in ["(?P<x>a)(?P<x>b)", "(?P<1x>a)", "(?P=missing)"]:
        with pytest.raises(ValueError):
            compile_pattern(pattern)


# @id TEST-CAPTURES-004
# @verifies REQ-CAPTURES-007 REQ-CAPTURES-008
def test_captures_004():
    assert compile_pattern("(a)c|ab").fullmatch("ab").group(1) is None
    assert compile_pattern("(a|b)+").fullmatch("ab").group(1) == "b"


# @id TEST-CAPTURES-005
# @verifies REQ-CAPTURES-009 REQ-CAPTURES-010
def test_captures_005():
    m = compile_pattern("(a)?b").fullmatch("b")
    assert m.group(1) is None
    assert m.span(1) == (-1, -1)
    for key in [-1, 2, "unknown"]:
        with pytest.raises(IndexError):
            m.group(key)
