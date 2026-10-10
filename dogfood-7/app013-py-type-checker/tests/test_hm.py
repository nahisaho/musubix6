import pytest
import json
import subprocess
import sys
from pycheck import hm

# @id TEST-HM-001 @verifies REQ-HM-001
def test_hm_001(tmp_path):
    assert hm.infer("True") == "bool"
    assert hm.infer("1") == "int"
    assert hm.infer("\"x\"") == "str"

# @id TEST-HM-002 @verifies REQ-HM-002
def test_hm_002(tmp_path):
    assert hm.infer("[1, 2]") == "list[int]"
    assert hm.infer("[1, \"s\"]") == "list[int | str]"

# @id TEST-HM-003 @verifies REQ-HM-003
def test_hm_003(tmp_path):
    assert hm.infer("(lambda x: x)(1)") == "int"
    assert hm.infer("(lambda x: x)(\"s\")") == "str"

# @id TEST-HM-004 @verifies REQ-HM-004
def test_hm_004(tmp_path):
    assert hm.infer("(lambda f: f(1))(lambda x: x)") == "int"

# @id TEST-HM-005 @verifies REQ-HM-005
def test_hm_005(tmp_path):
    assert hm.infer_let("ident", "lambda x: x", "(ident(1), ident(\"s\"))") == "tuple[int, str]"

# @id TEST-HM-006 @verifies REQ-HM-006
def test_hm_006(tmp_path):
    assert hm.infer("(lambda x: x)(1)") == "int"
    with pytest.raises(ValueError, match="infinite"): hm.infer("lambda x: x(x)")

# @id TEST-HM-007 @verifies REQ-HM-007
def test_hm_007(tmp_path):
    assert hm.infer("a", {"a": "str"}) == "str"
    with pytest.raises(ValueError, match="undefined"): hm.infer("unknown")
    with pytest.raises(ValueError, match="arity"): hm.infer("(lambda x: x)(1, 2)")

# @id TEST-HM-008 @verifies REQ-HM-008
def test_hm_008(tmp_path):
    assert hm.infer("1 + 2.5") == "float"
    assert hm.infer("\"a\" + \"b\"") == "str"
    with pytest.raises(ValueError): hm.infer("1 + \"a\"")


# @id TEST-HM-009 @verifies REQ-HM-009
def test_hm_009(tmp_path):
    with pytest.raises(ValueError):
        hm.infer("f(g)", {"f": "Callable[[Callable[[int], float]], float]", "g": "Callable[[bool], float]"})
    assert hm.infer("f(g)", {"f": "Callable[[Callable[[int], float]], float]", "g": "Callable[[float], int]"}) == "float"


# @id TEST-HM-010 @verifies REQ-HM-010
def test_hm_010(tmp_path):
    try:
        result = hm.infer("lambda y: (x, y)", {"x": "T"})
    except TypeError as error:
        raise AssertionError("mixed inference variables must render without crashing") from error
    assert result == "Callable[[U], tuple[T, U]]"
    result = hm.infer("lambda a,b,c,d,e,f,g,h: (a,b,c,d,e,f,g,h)")
    from pycheck.types import canonical
    assert canonical(result) == result
