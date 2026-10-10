import pytest
import json
import subprocess
import sys
from pycheck import flow

# @id TEST-FLOW-001 @verifies REQ-FLOW-001
def test_flow_001(tmp_path):
    assert flow.branches("x is None", {"x": "int | None"}) == ({"x": "None"}, {"x": "int"})

# @id TEST-FLOW-002 @verifies REQ-FLOW-002
def test_flow_002(tmp_path):
    assert flow.branches("isinstance(x, str)", {"x": "int | str"}) == ({"x": "str"}, {"x": "int"})

# @id TEST-FLOW-003 @verifies REQ-FLOW-003
def test_flow_003(tmp_path):
    assert flow.join({"x": "int"}, {"x": "str"}) == {"x": "int | str"}

# @id TEST-FLOW-004 @verifies REQ-FLOW-004
def test_flow_004(tmp_path):
    assert flow.branches("isinstance(x, str)", {"x": "int"}) == ({"x": "Never"}, {"x": "int"})

# @id TEST-FLOW-005 @verifies REQ-FLOW-005
def test_flow_005(tmp_path):
    env = {"x": "int | None"}
    assert flow.branches("x is not None", env)[0]["x"] == "int"
    assert env == {"x": "int | None"}

# @id TEST-FLOW-006 @verifies REQ-FLOW-006
def test_flow_006(tmp_path):
    assert flow.branches("x is not None and isinstance(x, int)", {"x": "int | str | None"})[0]["x"] == "int"

# @id TEST-FLOW-007 @verifies REQ-FLOW-007
def test_flow_007(tmp_path):
    assert flow.branches("isinstance(x, int) or isinstance(x, str)", {"x": "int | str | None"})[0]["x"] == "int | str"

# @id TEST-FLOW-008 @verifies REQ-FLOW-008
def test_flow_008(tmp_path):
    assert flow.branches("flag", {"x": "str", "flag": "bool"}) == ({"x": "str", "flag": "bool"}, {"x": "str", "flag": "bool"})
    env = {"x": "int | str", "isinstance": "Any"}
    assert flow.branches("isinstance(x, str)", env) == (env, env)
    env = {"x": "int | str", "str": "Any"}
    assert flow.branches("isinstance(x, str)", env) == (env, env)


# @id TEST-FLOW-009 @verifies REQ-FLOW-009
def test_flow_009(tmp_path):
    assert flow.branches("isinstance(x, float)", {"x": "int | float"}) == ({"x": "float"}, {"x": "int"})
    assert flow.branches("isinstance(x, int)", {"x": "bool | int | float"}) == ({"x": "bool | int"}, {"x": "float"})
