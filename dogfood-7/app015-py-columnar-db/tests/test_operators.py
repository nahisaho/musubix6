import pytest
from columnar.operators import select, project, predicate, aggregate, group_by, sort_rows, limit, distinct


# @id TEST-OPS-001 @verifies REQ-OPS-001
def test_ops_001():
    assert select([1, None, 3, 1], "eq", 1) == [0, 3]
    assert select([1, 3, 4], "gt", 2, [2, 0, 1]) == [2, 1]


# @id TEST-OPS-002 @verifies REQ-OPS-002
def test_ops_002():
    assert project([{"a": 1, "b": 2}, {"a": 3, "b": 4}], ["b"], [1, 0]) == [{"b": 4}, {"b": 2}]


# @id TEST-OPS-003 @verifies REQ-OPS-003
def test_ops_003():
    assert [predicate(2, op, 2) for op in ["eq", "ne", "lt", "le", "gt", "ge"]] == [True, False, False, True, False, True]
    assert predicate(None, "isnull", 7)
    assert predicate(None, "eq", None)
    assert predicate(None, "ne", 1)
    assert not predicate(None, "gt", 1)
    assert not predicate(1, "lt", None)
    with pytest.raises(ValueError):
        predicate(1, "execute", 1)


# @id TEST-OPS-004 @verifies REQ-OPS-004
def test_ops_004():
    values = [1, None, 3]
    assert [aggregate(values, op) for op in ["sum", "min", "max", "avg", "count", "count_all"]] == [4, 1, 3, 2, 2, 3]
    assert [aggregate([], op) for op in ["sum", "min", "max", "avg", "count", "count_all"]] == [0, None, None, None, 0, 0]
    with pytest.raises(ValueError):
        aggregate(values, "median")


# @id TEST-OPS-005 @verifies REQ-OPS-005
def test_ops_005():
    data = [{"k": None, "v": 2}, {"k": "a", "v": 4}, {"k": None, "v": 3}]
    assert group_by(data, ["k"], {"total": ("sum", "v"), "n": ("count_all", "v")}) == [
        {"k": None, "total": 5, "n": 2}, {"k": "a", "total": 4, "n": 1}
    ]


# @id TEST-OPS-006 @verifies REQ-OPS-006
def test_ops_006():
    data = [{"v": None, "id": 0}, {"v": 2, "id": 1}, {"v": 1, "id": 2}, {"v": 2, "id": 3}]
    assert [r["id"] for r in sort_rows(data, "v")] == [2, 1, 3, 0]
    assert [r["id"] for r in sort_rows(data, "v", True)] == [1, 3, 2, 0]


# @id TEST-OPS-007 @verifies REQ-OPS-007
def test_ops_007():
    assert limit([1, 2, 3, 4], 2, 1) == [2, 3]
    assert limit([1], 0) == []
    with pytest.raises(ValueError):
        limit([], -1)


# @id TEST-OPS-008 @verifies REQ-OPS-008
def test_ops_008():
    assert distinct([{"k": 1, "v": 2}, {"k": 1, "v": 3}, {"k": None, "v": 4}], ["k"]) == [
        {"k": 1, "v": 2}, {"k": None, "v": 4}
    ]
