from concurrent.futures import ThreadPoolExecutor
import pytest
from regexc.api import compile_pattern, StepLimitError


# @id TEST-SAFETY-001
# @verifies REQ-SAFETY-001 REQ-SAFETY-002
def test_safety_001():
    for pattern in ["(a|aa)*b", "(?:a|aa)*b"]:
        with pytest.raises(StepLimitError):
            compile_pattern(pattern).fullmatch("a" * 20, step_limit=30)
    assert compile_pattern("a").fullmatch("a", step_limit=100) is not None


# @id TEST-SAFETY-002
# @verifies REQ-SAFETY-003 REQ-SAFETY-004
def test_safety_002():
    p = compile_pattern("b+")
    assert p.search("aabb").span() == (2, 4)
    assert p.match("aabb") is None
    assert p.match("aabb", pos=2).span() == (2, 4)
    with pytest.raises(StepLimitError):
        p.search("a" * 80, step_limit=20)


# @id TEST-SAFETY-003
# @verifies REQ-SAFETY-005 REQ-SAFETY-006
def test_safety_003():
    assert [m.span() for m in compile_pattern("").finditer("ab")] == [(0, 0), (1, 1), (2, 2)]
    assert [m.span() for m in compile_pattern("a+").finditer("aa!a")] == [(0, 2), (3, 4)]
    with pytest.raises(StepLimitError):
        list(compile_pattern("").finditer("a" * 80, step_limit=10))


# @id TEST-SAFETY-004
# @verifies REQ-SAFETY-007 REQ-SAFETY-008
def test_safety_004():
    p = compile_pattern("(a+)")
    with ThreadPoolExecutor(max_workers=4) as pool:
        assert list(pool.map(lambda n: p.fullmatch("a" * n).group(1), range(1, 20))) == ["a" * n for n in range(1, 20)]
    for limit in [0, -1, 1.5, True]:
        with pytest.raises(ValueError):
            p.fullmatch("a", step_limit=limit)
    for pos in [-1, 2, 0.5, True]:
        with pytest.raises(ValueError):
            p.match("a", pos=pos)


# @id TEST-SAFETY-005
# @verifies REQ-SAFETY-009
def test_safety_005():
    assert isinstance("(?<=ab)c", str)
    assert len("漢") == 1
    assert "٤".isdecimal()


# @id TEST-SAFETY-006
# @verifies REQ-SAFETY-011 REQ-SAFETY-012
def test_safety_006():
    for pattern in ["(?:a{1000}){1000}", "a" * 4097, "(" * 101 + "a" + ")" * 101]:
        with pytest.raises(ValueError):
            compile_pattern(pattern)
    with pytest.raises(ValueError):
        compile_pattern("a*").fullmatch("a" * 513)


# @id TEST-SAFETY-007
# @verifies REQ-SAFETY-013
def test_safety_007():
    assert compile_pattern("(){1000}").fullmatch("").group(1) == ""
    assert compile_pattern("^" * 1200).fullmatch("").span() == (0, 0)
    assert compile_pattern("a?" * 1000).match("").span() == (0, 0)
