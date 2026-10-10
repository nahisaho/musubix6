import pytest
from policy.roles import closure, allowed

# @id TEST-ROLES-001 @verifies REQ-ROLES-001
def test_roles_001():
    assert closure({"admin": ["editor"], "editor": ["reader"], "reader": []}, ["admin"]) == ["admin", "editor", "reader"]

# @id TEST-ROLES-002 @verifies REQ-ROLES-002
def test_roles_002():
    assert closure({"a": ["b", "c"], "b": ["d"], "c": ["d"], "d": []}, ["a", "b"]) == ["a", "b", "c", "d"]

# @id TEST-ROLES-003 @verifies REQ-ROLES-003
def test_roles_003():
    with pytest.raises(ValueError, match="cycle"):
        closure({"a": ["b"], "b": ["a"]}, [])

# @id TEST-ROLES-004 @verifies REQ-ROLES-004
def test_roles_004():
    with pytest.raises(ValueError, match="unknown parent"):
        closure({"a": ["missing"]}, ["a"])

# @id TEST-ROLES-005 @verifies REQ-ROLES-005
def test_roles_005():
    assert allowed({"admin": ["reader"], "reader": []}, {"reader": [("read", "docs/*")]}, ["admin"], "read", "docs/a") is True

# @id TEST-ROLES-006 @verifies REQ-ROLES-006
def test_roles_006():
    assert allowed({"reader": []}, {"reader": [("read", "docs/*")]}, ["reader"], "write", "docs/a") is False
    assert allowed({"reader": []}, {"reader": [("read", "docs/*")]}, ["reader"], "READ", "docs/a") is False

# @id TEST-ROLES-007 @verifies REQ-ROLES-007
def test_roles_007():
    with pytest.raises(ValueError, match="unknown role"):
        closure({"reader": []}, ["root"])

# @id TEST-ROLES-008 @verifies REQ-ROLES-008
def test_roles_008():
    assert closure({"reader": []}, []) == []

# @id TEST-ROLES-009 @verifies REQ-ROLES-009
def test_roles_009():
    graph = {letter: [] for letter in "admin"}
    for assigned in ["admin", None, [[]], [{"role": "a"}], [1]]:
        with pytest.raises(ValueError, match="assigned roles"):
            closure(graph, assigned)

# @id TEST-ROLES-010 @verifies REQ-ROLES-010
def test_roles_010():
    graph = {str(i): [str(i + 1)] for i in range(1499)}
    graph["1499"] = []
    assert len(closure(graph, ["0"])) == 1500
