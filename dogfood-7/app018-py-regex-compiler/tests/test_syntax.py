import pytest
from regexc.api import compile_pattern


# @id TEST-SYNTAX-001
# @verifies REQ-SYNTAX-001 REQ-SYNTAX-002
def test_syntax_001():
    assert compile_pattern(r"a\.b").fullmatch("a.b").group() == "a.b"
    assert compile_pattern("ab").fullmatch("ba") is None


# @id TEST-SYNTAX-002
# @verifies REQ-SYNTAX-003 REQ-SYNTAX-004
def test_syntax_002():
    assert compile_pattern("a|ab").match("ab").group() == "a"
    assert compile_pattern("(?:)|a").match("a").group() == ""
    assert compile_pattern("a|").fullmatch("") is not None


# @id TEST-SYNTAX-003
# @verifies REQ-SYNTAX-005 REQ-SYNTAX-006
def test_syntax_003():
    assert compile_pattern("[a-c]+[^0-9]").fullmatch("abc!").group() == "abc!"
    for pattern in ["[z-a]", "[abc"]:
        with pytest.raises(ValueError):
            compile_pattern(pattern)


# @id TEST-SYNTAX-004
# @verifies REQ-SYNTAX-007 REQ-SYNTAX-008
def test_syntax_004():
    for pattern, text in [(r"\p{L}+", "α漢"), (r"\p{Lu}", "Ω"), (r"\p{Ll}", "é"),
                          (r"\p{Nd}", "٤"), (r"\p{N}", "Ⅳ"), (r"\p{Z}", "\u2003"),
                          (r"\d\w\s", "٤漢\u2003"), (r"\P{L}", "4"),
                          (r"[\p{L}\d]+", "漢٤"), (r"\D\W\S", "a!漢")]:
        assert compile_pattern(pattern).fullmatch(text) is not None
    assert compile_pattern(r"\P{L}").fullmatch("漢") is None


# @id TEST-SYNTAX-005
# @verifies REQ-SYNTAX-009 REQ-SYNTAX-010
def test_syntax_005():
    for pattern in ["\\", "(", ")", "*a", r"\p{Unknown}", "a**", "(?q:a)"]:
        with pytest.raises(ValueError):
            compile_pattern(pattern)
    assert compile_pattern(".").fullmatch("漢") is not None
    assert compile_pattern(".").fullmatch("\n") is None
