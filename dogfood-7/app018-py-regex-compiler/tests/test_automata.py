import pytest
from regexc.api import compile_pattern


# @id TEST-AUTOMATA-001
# @verifies REQ-AUTOMATA-001 REQ-AUTOMATA-002
def test_automata_001():
    p = compile_pattern("(?:ab|c)*d")
    assert p.backend == "nfa"
    assert p.fullmatch("abccd").span() == (0, 5)
    assert p.fullmatch("abccdx") is None


# @id TEST-AUTOMATA-002
# @verifies REQ-AUTOMATA-003 REQ-AUTOMATA-004
def test_automata_002():
    assert compile_pattern("a+").match("aaa").group() == "aaa"
    assert compile_pattern("a+?").match("aaa").group() == "a"
    assert compile_pattern("a{1,3}?").match("aaa").group() == "a"
    assert compile_pattern("a*?b").fullmatch("aaab").group() == "aaab"
    assert compile_pattern("(?:a|ab)+").match("ab").group() == "a"


# @id TEST-AUTOMATA-003
# @verifies REQ-AUTOMATA-005 REQ-AUTOMATA-006
def test_automata_003():
    assert compile_pattern("a*+a").fullmatch("aaa") is None
    assert compile_pattern("a*a").fullmatch("aaa") is not None
    assert compile_pattern("(?>a|ab)c").fullmatch("abc") is None
    assert compile_pattern("(?:a|ab)c").fullmatch("abc") is not None
    assert compile_pattern("a{1,3}+a").fullmatch("aaa") is None


# @id TEST-AUTOMATA-004
# @verifies REQ-AUTOMATA-007 REQ-AUTOMATA-008
def test_automata_004():
    for text, accepted in [("", False), ("a", False), ("aa", True), ("aaa", True), ("aaaa", False)]:
        assert (compile_pattern("a{2,3}").fullmatch(text) is not None) == accepted
    assert compile_pattern("a{0}").fullmatch("") is not None
    assert compile_pattern("a{2,}").fullmatch("aaaa") is not None
    for pattern in ["a{3,2}", "a{1001}", "a{,2}"]:
        with pytest.raises(ValueError):
            compile_pattern(pattern)


# @id TEST-AUTOMATA-005
# @verifies REQ-AUTOMATA-009 REQ-AUTOMATA-010
def test_automata_005():
    assert compile_pattern("(?:)*").fullmatch("") is not None
    assert compile_pattern("(){2}").fullmatch("").group(1) == ""
    p = compile_pattern("(?:a|aa)*b")
    assert p.fullmatch("a" * 80, step_limit=10000) is None
    assert p.fullmatch("a" * 80 + "b", step_limit=10000) is not None


# @id TEST-AUTOMATA-006
# @verifies REQ-AUTOMATA-011
def test_automata_006():
    assert compile_pattern("()*").match("").group(1) == ""
    assert compile_pattern("(a?)*").match("a").group(1) == ""
    assert compile_pattern("(?:|a)*").match("a").group() == ""
    assert compile_pattern("(?:|a)*+a").fullmatch("a") is not None


# @id TEST-AUTOMATA-007
# @verifies REQ-AUTOMATA-011
def test_automata_007():
    m = compile_pattern("(|a){2,3}").fullmatch("a")
    assert m.group(1) == "a"
    assert m.span(1) == (0, 1)
