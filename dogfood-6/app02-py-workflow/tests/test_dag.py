import pytest
from wf.dag.errors import CycleError, DuplicateTask, UnknownDependency
from wf.dag.graph import Graph


def build(spec):
    g = Graph()
    for tid, deps in spec:
        g.add_task(tid, deps)
    return g


# @id TEST-DAG-001
# @verifies REQ-DAG-001
def test_dag_001_insertion_order():
    g = build([("b", []), ("a", ["b"]), ("c", [])])
    assert g.tasks() == ["b", "a", "c"]


# @id TEST-DAG-002
# @verifies REQ-DAG-002
def test_dag_002_duplicate():
    g = build([("a", [])])
    with pytest.raises(DuplicateTask):
        g.add_task("a")


# @id TEST-DAG-003
# @verifies REQ-DAG-003
def test_dag_003_unknown_dependency():
    g = build([("a", ["zz"])])
    with pytest.raises(UnknownDependency) as ei:
        g.validate()
    assert "zz" in str(ei.value)


# @id TEST-DAG-004
# @verifies REQ-DAG-004
def test_dag_004_find_cycle():
    g = build([("a", ["c"]), ("b", ["a"]), ("c", ["b"]), ("d", [])])
    cyc = g.find_cycle()
    assert cyc[0] == cyc[-1]
    assert set(cyc) == {"a", "b", "c"}
    assert build([("a", []), ("b", ["a"])]).find_cycle() is None


# @id TEST-DAG-005
# @verifies REQ-DAG-005
def test_dag_005_self_cycle():
    assert build([("x", ["x"])]).find_cycle() == ["x", "x"]


# @id TEST-DAG-006
# @verifies REQ-DAG-006
def test_dag_006_topological_order():
    g = build([("d", ["b", "c"]), ("c", ["a"]), ("b", ["a"]), ("a", []), ("e", [])])
    assert g.topological_order() == ["a", "c", "b", "d", "e"]


# @id TEST-DAG-007
# @verifies REQ-DAG-007
def test_dag_007_cycle_error():
    g = build([("a", ["b"]), ("b", ["a"])])
    with pytest.raises(CycleError) as ei:
        g.topological_order()
    assert set(ei.value.cycle) == {"a", "b"}


# @id TEST-DAG-008
# @verifies REQ-DAG-008
def test_dag_008_layers():
    g = build([("a", []), ("b", ["a"]), ("c", ["a"]), ("d", ["b", "c"]), ("e", [])])
    assert g.layers() == [["a", "e"], ["b", "c"], ["d"]]


# @id TEST-DAG-009
# @verifies REQ-DAG-009
def test_dag_009_dependents():
    g = build([("a", []), ("b", ["a"]), ("c", ["b"]), ("d", ["a"]), ("x", [])])
    assert g.dependents("a") == ["b", "c", "d"]
    assert g.dependents("b") == ["c"]
    assert g.dependents("x") == []
