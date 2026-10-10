import json

import pytest
from wf.store.errors import CorruptJournal, IllegalTransition
from wf.store.states import State, TRANSITIONS, is_terminal
from wf.store.store import StateStore


def jpath(tmp_path):
    return tmp_path / "journal.jsonl"


# @id TEST-STORE-001
# @verifies REQ-STORE-001
def test_store_001_state_table():
    assert {s.name for s in State} == {"PENDING", "RUNNING", "RETRYING", "SUCCEEDED", "FAILED", "CANCELLED"}
    assert TRANSITIONS[State.PENDING] == {State.RUNNING, State.CANCELLED}
    assert TRANSITIONS[State.RUNNING] == {State.SUCCEEDED, State.FAILED, State.RETRYING, State.CANCELLED}
    assert TRANSITIONS[State.RETRYING] == {State.RUNNING, State.CANCELLED}
    assert TRANSITIONS[State.SUCCEEDED] == set()


# @id TEST-STORE-002
# @verifies REQ-STORE-002
def test_store_002_allowed_transition(tmp_path):
    s = StateStore.open(jpath(tmp_path))
    s.transition("a", State.RUNNING)
    assert s.state("a") == State.RUNNING
    s.transition("a", State.SUCCEEDED)
    assert s.state("a") == State.SUCCEEDED


# @id TEST-STORE-003
# @verifies REQ-STORE-003
def test_store_003_illegal_transition(tmp_path):
    s = StateStore.open(jpath(tmp_path))
    with pytest.raises(IllegalTransition):
        s.transition("a", State.SUCCEEDED)
    assert s.state("a") == State.PENDING
    assert not jpath(tmp_path).exists() or jpath(tmp_path).read_text() == ""


# @id TEST-STORE-004
# @verifies REQ-STORE-004
@pytest.mark.parametrize("terminal", [State.SUCCEEDED, State.FAILED, State.CANCELLED])
def test_store_004_terminal_rejects_all(tmp_path, terminal):
    s = StateStore.open(jpath(tmp_path))
    s.transition("a", State.RUNNING)
    s.transition("a", terminal)
    assert is_terminal(terminal)
    for target in State:
        with pytest.raises(IllegalTransition):
            s.transition("a", target)
    assert s.state("a") == terminal


# @id TEST-STORE-005
# @verifies REQ-STORE-005
def test_store_005_journal_line(tmp_path):
    p = jpath(tmp_path)
    s = StateStore.open(p)
    s.transition("a", State.RUNNING, detail={"n": 1})
    lines = p.read_text().splitlines()
    assert len(lines) == 1
    rec = json.loads(lines[0])
    assert rec == {"seq": 1, "task": "a", "from": "PENDING", "to": "RUNNING", "detail": {"n": 1}}


# @id TEST-STORE-006
# @verifies REQ-STORE-006
def test_store_006_reload(tmp_path):
    p = jpath(tmp_path)
    s = StateStore.open(p)
    s.transition("a", State.RUNNING)
    s.transition("a", State.SUCCEEDED)
    s.transition("b", State.RUNNING)
    r = StateStore.open(p)
    assert r.state("a") == State.SUCCEEDED
    assert r.state("b") == State.RUNNING
    r.transition("b", State.FAILED)
    assert json.loads(p.read_text().splitlines()[-1])["seq"] == 4


# @id TEST-STORE-007
# @verifies REQ-STORE-007
def test_store_007_truncation_and_corruption(tmp_path):
    p = jpath(tmp_path)
    s = StateStore.open(p)
    s.transition("a", State.RUNNING)
    s.transition("a", State.SUCCEEDED)
    good = p.read_text()
    p.write_text(good + '{"seq": 3, "task": "b", "fr')
    assert StateStore.open(p).state("a") == State.SUCCEEDED
    lines = good.splitlines()
    p.write_text("garbage\n" + lines[1] + "\n")
    with pytest.raises(CorruptJournal):
        StateStore.open(p)


# @id TEST-STORE-008
# @verifies REQ-STORE-008
def test_store_008_history(tmp_path):
    s = StateStore.open(jpath(tmp_path))
    s.transition("a", State.RUNNING)
    s.transition("b", State.RUNNING)
    s.transition("a", State.RETRYING)
    s.transition("a", State.RUNNING)
    h = s.history("a")
    assert [(r["seq"], r["to"]) for r in h] == [(1, "RUNNING"), (3, "RETRYING"), (4, "RUNNING")]
    assert s.history("zzz") == []


# @id TEST-STORE-009
# @verifies REQ-STORE-009
def test_store_009_recover(tmp_path):
    p = jpath(tmp_path)
    s = StateStore.open(p)
    s.transition("a", State.RUNNING)
    s.transition("b", State.RUNNING)
    s.transition("b", State.SUCCEEDED)
    s.transition("c", State.RUNNING)
    r = StateStore.open(p)
    assert sorted(r.recover()) == ["a", "c"]
    assert r.state("a") == State.RETRYING
    assert r.state("b") == State.SUCCEEDED
    assert r.recover() == []


# @id TEST-STORE-010
# @verifies REQ-STORE-010
def test_store_010_default_pending(tmp_path):
    s = StateStore.open(jpath(tmp_path))
    assert s.state("nope") == State.PENDING
    s.transition("nope", State.CANCELLED)
    assert s.history("nope")[0]["from"] == "PENDING"
