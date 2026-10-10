import pytest
from columnar.storage import build_table, scan, append, snapshot, zone_maps, prune, rows


# @id TEST-STO-001 @verifies REQ-STO-001
def test_sto_001():
    table = build_table({"a": [1, 1, 2], "b": ["x", None, "y"]}, 2)
    assert table.length == 3
    assert table.block_size == 2
    assert tuple(table.columns) == ("a", "b")


# @id TEST-STO-002 @verifies REQ-STO-002
def test_sto_002():
    table = build_table({"a": [1, 2, 3]})
    assert scan(table, "a") == [1, 2, 3]
    assert scan(table, "a", [2, 0, 2]) == [3, 1, 3]


# @id TEST-STO-003 @verifies REQ-STO-003
def test_sto_003():
    original = build_table({"a": [1]})
    assert scan(append(original, {"a": [2, 3]}), "a") == [1, 2, 3]
    assert scan(original, "a") == [1]


# @id TEST-STO-004 @verifies REQ-STO-004
def test_sto_004():
    source = {"a": [1, 2]}
    table = snapshot(build_table(source))
    source["a"][0] = 99
    assert scan(table, "a") == [1, 2]
    with pytest.raises(TypeError):
        table.columns["a"] = None


# @id TEST-STO-005 @verifies REQ-STO-005
def test_sto_005():
    with pytest.raises(ValueError):
        build_table({"a": [1], "b": []})
    with pytest.raises(ValueError):
        build_table({"a": []}, 0)
    with pytest.raises(ValueError):
        append(build_table({"a": [1]}), {"b": [2]})


# @id TEST-STO-006 @verifies REQ-STO-006
def test_sto_006():
    assert zone_maps(build_table({"a": [None, None, 3, 1, None]}, 2), "a") == [
        (None, None, 2), (1, 3, 0), (None, None, 1)
    ]


# @id TEST-STO-007 @verifies REQ-STO-007
def test_sto_007():
    table = build_table({"a": [1, 2, 10, 12, None]}, 2)
    assert prune(table, "a", 11) == [1]
    assert prune(table, "a", None) == [2]
    assert prune(table, "a", 99) == []


# @id TEST-STO-008 @verifies REQ-STO-008
def test_sto_008():
    assert rows(build_table({"a": [1, 1], "b": ["x", "x"]})) == [
        {"a": 1, "b": "x"}, {"a": 1, "b": "x"}
    ]


# @id TEST-STO-009 @verifies REQ-STO-009
def test_sto_009():
    table = build_table({"a": [float("nan"), 1.0, 2.0, float("nan")]}, 2)
    assert prune(table, "a", 1.0) == [0, 1]
    assert prune(table, "a", 999.0) == [0, 1]
