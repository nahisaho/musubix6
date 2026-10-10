import pytest
from worker.states import STATES, TRANSITIONS, can_transition, is_terminal, reachable, shortest_path, UnknownStateError


# @id TEST-CON-101
# @verifies REQ-CON-001
def test_con_101_states_known():
    assert len(STATES) == 7
    for src, tos in TRANSITIONS.items():
        assert src in STATES
        for t in tos:
            assert t in STATES


# @id TEST-CON-102
# @verifies REQ-CON-002
def test_con_102_allowed():
    assert can_transition("queued", "running") is True
    assert can_transition("failed", "retrying") is True


# @id TEST-CON-103
# @verifies REQ-CON-003
def test_con_103_rejected():
    assert can_transition("succeeded", "running") is False
    assert can_transition("running", "running") is False


# @id TEST-CON-104
# @verifies REQ-CON-004
def test_con_104_unknown():
    with pytest.raises(UnknownStateError):
        can_transition("nope", "running")
    with pytest.raises(UnknownStateError):
        is_terminal("nope")


# @id TEST-CON-105
# @verifies REQ-CON-005
def test_con_105_terminal():
    assert sorted(s for s in STATES if is_terminal(s)) == ["cancelled", "dead", "succeeded"]


# @id TEST-CON-106
# @verifies REQ-CON-006
def test_con_106_terminal_no_out_edges():
    for s in STATES:
        if is_terminal(s):
            assert TRANSITIONS[s] == []


# @id TEST-CON-107
# @verifies REQ-CON-007
def test_con_107_reachable():
    assert reachable("queued") == ["cancelled", "dead", "failed", "retrying", "running", "succeeded"]
    assert reachable("failed") == ["cancelled", "dead", "failed", "retrying", "running", "succeeded"]
    assert reachable("dead") == []


# @id TEST-CON-108
# @verifies REQ-CON-008
def test_con_108_shortest_path():
    assert shortest_path("queued", "succeeded") == ["queued", "running", "succeeded"]
    assert shortest_path("queued", "queued") == ["queued"]
    assert shortest_path("dead", "queued") is None
