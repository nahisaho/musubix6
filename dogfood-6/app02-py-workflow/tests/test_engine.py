import pytest
from wf.dag.errors import CycleError, UnknownDependency
from wf.dag.graph import Graph
from wf.engine.runner import Engine
from wf.retry.clock import FakeClock
from wf.retry.policy import RetryPolicy
from wf.store.states import State
from wf.store.store import StateStore


def setup(tmp_path, spec, actions=None, policy=None, journal="j.jsonl"):
    g = Graph()
    for tid, deps in spec:
        g.add_task(tid, deps)
    log = []
    acts = {}
    for tid, _ in spec:
        acts[tid] = (actions or {}).get(tid) or (lambda deps, t=tid: (log.append(t), t.upper())[1])
    store = StateStore.open(tmp_path / journal)
    clock = FakeClock(0.0)
    pol = policy or RetryPolicy(base=1.0, factor=2.0, max_delay=100.0, max_attempts=3)
    eng = Engine(g, acts, store, clock, pol)
    return eng, store, clock, log


DIAMOND = [("a", []), ("b", ["a"]), ("c", ["a"]), ("d", ["b", "c"])]


# @id TEST-ENGINE-001
# @verifies REQ-ENGINE-001
def test_engine_001_topological_order(tmp_path):
    eng, _, _, log = setup(tmp_path, [("d", ["b", "c"]), ("c", ["a"]), ("b", ["a"]), ("a", [])])
    eng.run()
    assert log == ["a", "c", "b", "d"]


# @id TEST-ENGINE-002
# @verifies REQ-ENGINE-002
def test_engine_002_dependency_results(tmp_path):
    seen = {}

    def d_action(deps):
        seen.update(deps)
        return 1

    eng, _, _, _ = setup(tmp_path, DIAMOND, {"d": d_action})
    eng.run()
    assert seen == {"b": "B", "c": "C"}


# @id TEST-ENGINE-003
# @verifies REQ-ENGINE-003
def test_engine_003_cycle_detected_first(tmp_path):
    eng, store, _, log = setup(tmp_path, [("a", ["b"]), ("b", ["a"]), ("c", [])])
    with pytest.raises(CycleError):
        eng.run()
    assert log == []
    assert store.history("c") == []
    assert not (tmp_path / "j.jsonl").exists()


# @id TEST-ENGINE-004
# @verifies REQ-ENGINE-004
def test_engine_004_retry_with_backoff(tmp_path):
    calls = {"n": 0}

    def flaky(deps):
        calls["n"] += 1
        if calls["n"] < 3:
            raise RuntimeError("transient")
        return "fine"

    eng, store, clock, _ = setup(tmp_path, [("a", [])], {"a": flaky})
    report = eng.run()
    assert report.results["a"] == "fine"
    assert clock.now() == 3.0
    assert [r["to"] for r in store.history("a")] == ["RUNNING", "RETRYING", "RUNNING", "RETRYING", "RUNNING", "SUCCEEDED"]


# @id TEST-ENGINE-005
# @verifies REQ-ENGINE-005
def test_engine_005_failure_cascades(tmp_path):
    def bad(deps):
        raise RuntimeError("nope")

    eng, store, clock, log = setup(tmp_path, [("a", []), ("b", ["a"]), ("c", ["b"]), ("x", [])], {"a": bad})
    report = eng.run()
    assert report.states == {"a": State.FAILED, "b": State.CANCELLED, "c": State.CANCELLED, "x": State.SUCCEEDED}
    assert log == ["x"]
    assert clock.now() == 3.0


# @id TEST-ENGINE-006
# @verifies REQ-ENGINE-006
def test_engine_006_cancel_during_run(tmp_path):
    holder = {}

    def stopper(deps):
        holder["eng"].cancel()
        return "done"

    eng, store, _, log = setup(tmp_path, [("a", []), ("b", ["a"]), ("c", [])], {"a": stopper})
    holder["eng"] = eng
    report = eng.run()
    assert report.states == {"a": State.SUCCEEDED, "b": State.CANCELLED, "c": State.CANCELLED}
    assert log == []
    assert report.ok is False


# @id TEST-ENGINE-007
# @verifies REQ-ENGINE-007
def test_engine_007_cancel_before_run(tmp_path):
    eng, store, _, log = setup(tmp_path, DIAMOND)
    eng.cancel()
    report = eng.run()
    assert log == []
    assert set(report.states.values()) == {State.CANCELLED}
    assert store.state("a") == State.CANCELLED


# @id TEST-ENGINE-008
# @verifies REQ-ENGINE-008
def test_engine_008_resume_skips_succeeded(tmp_path):
    eng, store, _, log = setup(tmp_path, DIAMOND)
    eng.run()
    assert log == ["a", "b", "c", "d"]
    eng2, store2, _, log2 = setup(tmp_path, DIAMOND)
    report = eng2.run()
    assert log2 == []
    assert report.results == {"a": "A", "b": "B", "c": "C", "d": "D"}
    assert report.ok is True


# @id TEST-ENGINE-009
# @verifies REQ-ENGINE-009
def test_engine_009_report(tmp_path):
    eng, _, _, _ = setup(tmp_path, DIAMOND)
    report = eng.run()
    assert report.ok is True
    assert report.states == {t: State.SUCCEEDED for t in "abcd"}
    assert report.results == {"a": "A", "b": "B", "c": "C", "d": "D"}


# @id TEST-ENGINE-010
# @verifies REQ-ENGINE-010
def test_engine_010_transitions_recorded(tmp_path):
    eng, store, _, _ = setup(tmp_path, [("a", []), ("b", ["a"])])
    eng.run()
    assert [r["to"] for r in store.history("a")] == ["RUNNING", "SUCCEEDED"]
    assert [r["to"] for r in store.history("b")] == ["RUNNING", "SUCCEEDED"]
    assert store.history("a")[-1]["detail"] == {"result": "A"}


# @id TEST-ENGINE-011
# @verifies REQ-ENGINE-011
def test_engine_011_unknown_dependency(tmp_path):
    eng, _, _, log = setup(tmp_path, [("a", []), ("b", ["ghost"])])
    with pytest.raises(UnknownDependency):
        eng.run()
    assert log == []


# @id TEST-ENGINE-012
# @verifies REQ-ENGINE-012
def test_engine_012_recover_crashed_running(tmp_path):
    eng, store, _, log = setup(tmp_path, [("a", []), ("b", ["a"])])
    store.transition("a", State.RUNNING)
    eng2, store2, _, log2 = setup(tmp_path, [("a", []), ("b", ["a"])])
    report = eng2.run()
    assert report.ok is True
    assert log2 == ["a", "b"]
    assert [r["to"] for r in store2.history("a")] == ["RUNNING", "RETRYING", "RUNNING", "SUCCEEDED"]
