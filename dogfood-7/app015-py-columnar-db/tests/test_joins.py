from collections import Counter
import pytest
from columnar.joins import hash_join, merge_join, semi_join, anti_join, left_join, choose_join, join_count


def bag(data):
    return Counter(tuple(sorted(row.items())) for row in data)


# @id TEST-JOIN-001 @verifies REQ-JOIN-001
def test_join_001():
    result = hash_join([{"k": 1}, {"k": 1}, {"k": None}], [{"k": 1}, {"k": 1}, {"k": None}], ["k"], ["k"])
    assert result == [{"l.k": 1, "r.k": 1}] * 4


# @id TEST-JOIN-002 @verifies REQ-JOIN-002
def test_join_002():
    left, right = [{"k": 2}, {"k": 1}, {"k": 1}, {"k": None}], [{"k": 1}, {"k": 2}, {"k": 1}]
    assert bag(merge_join(left, right, ["k"], ["k"])) == bag(hash_join(left, right, ["k"], ["k"]))
    assert merge_join([], right, ["k"], ["k"]) == []


# @id TEST-JOIN-003 @verifies REQ-JOIN-003
def test_join_003():
    assert semi_join([{"k": 1}, {"k": 1}, {"k": 2}], [{"k": 1}, {"k": 1}], ["k"], ["k"]) == [{"k": 1}, {"k": 1}]


# @id TEST-JOIN-004 @verifies REQ-JOIN-004
def test_join_004():
    assert anti_join([{"k": 1}, {"k": None}, {"k": 2}], [{"k": 1}, {"k": None}], ["k"], ["k"]) == [{"k": None}, {"k": 2}]


# @id TEST-JOIN-005 @verifies REQ-JOIN-005
def test_join_005():
    assert left_join([{"k": 2}, {"k": 1}], [{"k": 1, "v": "x"}, {"k": 1, "v": "y"}], ["k"], ["k"]) == [
        {"l.k": 2, "r.k": None, "r.v": None},
        {"l.k": 1, "r.k": 1, "r.v": "x"}, {"l.k": 1, "r.k": 1, "r.v": "y"}
    ]


# @id TEST-JOIN-006 @verifies REQ-JOIN-006
def test_join_006():
    assert choose_join(100, 20) == {"strategy": "hash", "work": 120}
    assert choose_join(100, 20, True, True) == {"strategy": "merge", "work": 120}


# @id TEST-JOIN-007 @verifies REQ-JOIN-007
def test_join_007():
    with pytest.raises(ValueError):
        hash_join([{"a": 1}], [{"a": 1}], ["missing"], ["a"])
    with pytest.raises(ValueError):
        merge_join([], [], ["a", "b"], ["a"])
    with pytest.raises(ValueError):
        hash_join([], [], [], [])


# @id TEST-JOIN-008 @verifies REQ-JOIN-008
def test_join_008():
    assert join_count([{"k": 1}] * 4 + [{"k": None}], [{"k": 1}] * 3, ["k"], ["k"]) == 12
