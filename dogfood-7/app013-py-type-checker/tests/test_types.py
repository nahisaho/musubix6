import pytest
import json
import subprocess
import sys
from pycheck import types

# @id TEST-TYPES-001 @verifies REQ-TYPES-001
def test_types_001(tmp_path):
    assert types.canonical("int") == "int"

# @id TEST-TYPES-002 @verifies REQ-TYPES-002
def test_types_002(tmp_path):
    assert types.canonical("Union[str, int, int]") == "int | str"

# @id TEST-TYPES-003 @verifies REQ-TYPES-003
def test_types_003(tmp_path):
    assert types.compatible("Any", "int")
    assert types.compatible("int", "Any")
    assert types.compatible("Never", "str")

# @id TEST-TYPES-004 @verifies REQ-TYPES-004
def test_types_004(tmp_path):
    assert types.compatible("bool", "int")
    assert types.compatible("int", "float")
    assert not types.compatible("str", "int")

# @id TEST-TYPES-005 @verifies REQ-TYPES-005
def test_types_005(tmp_path):
    assert types.compatible("int", "int | str")
    assert not types.compatible("int | str", "int")

# @id TEST-TYPES-006 @verifies REQ-TYPES-006
def test_types_006(tmp_path):
    assert types.compatible("list[int]", "list[int]")
    assert not types.compatible("list[bool]", "list[int]")

# @id TEST-TYPES-007 @verifies REQ-TYPES-007
def test_types_007(tmp_path):
    assert types.replace("dict[str, list[T]]", {"T": "int"}) == "dict[str, list[int]]"

# @id TEST-TYPES-008 @verifies REQ-TYPES-008
def test_types_008(tmp_path):
    assert types.canonical("list[int]") == "list[int]"
    with pytest.raises(ValueError): types.canonical("list[int, str]")
    with pytest.raises(ValueError): types.canonical("int |")


# @id TEST-TYPES-009 @verifies REQ-TYPES-009
def test_types_009(tmp_path):
    assert types.canonical("str | None | int") == "None | int | str"
