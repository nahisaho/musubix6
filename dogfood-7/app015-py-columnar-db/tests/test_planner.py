import pytest
from columnar.storage import build_table
from columnar.planner import Catalog, plan, execute, explain, estimate, execute_batch


def catalog():
    return Catalog({"t": build_table({"k": [1, 2, 10, 12, None], "v": [4, 3, 2, 1, 0]}, 2),
                    "r": build_table({"k": [1, 1, 12], "name": ["a", "b", "c"]})})


# @id TEST-PLAN-001 @verifies REQ-PLAN-001
def test_plan_001():
    assert [n["op"] for n in explain(plan(catalog(), {"table": "t", "filters": [("k", "gt", 2)], "project": ["v"]}))["nodes"]] == ["scan", "filter", "project"]


# @id TEST-PLAN-002 @verifies REQ-PLAN-002
def test_plan_002():
    query = {"table": "t", "filters": [("k", "gt", 2)], "project": ["v"], "sort": ("v", False), "limit": (1, 0)}
    assert execute(catalog(), plan(catalog(), query)) == [{"v": 1}]


# @id TEST-PLAN-003 @verifies REQ-PLAN-003
def test_plan_003():
    p = plan(catalog(), {"table": "t"})
    assert explain(p) == {"nodes": [{"op": "scan", "table": "t", "estimated_rows": 5}], "blocks": [0, 1, 2], "estimated_rows": 5}


# @id TEST-PLAN-004 @verifies REQ-PLAN-004
def test_plan_004():
    c = catalog()
    p = plan(c, {"table": "t", "filters": [("k", "eq", 11)]})
    assert explain(p)["blocks"] == [1]
    assert execute(c, p) == []
    assert execute(c, plan(c, {"table": "t", "filters": [("k", "eq", None)]})) == [{"k": None, "v": 0}]


# @id TEST-PLAN-005 @verifies REQ-PLAN-005
def test_plan_005():
    c = catalog()
    assert estimate(c, {"table": "t", "filters": [("k", "eq", 12)]}) == 1
    assert estimate(c, {"table": "t", "filters": [("k", "eq", 99)]}) == 0


# @id TEST-PLAN-006 @verifies REQ-PLAN-006
def test_plan_006():
    source = {"t": build_table({"k": [1]})}
    c = Catalog(source)
    source.clear()
    query = {"table": "t", "project": ["k"]}
    p = plan(c, query)
    query["project"].clear()
    assert execute(c, p) == [{"k": 1}]
    with pytest.raises(TypeError):
        c.tables["t"] = None


# @id TEST-PLAN-007 @verifies REQ-PLAN-007
def test_plan_007():
    for query in [{"table": "missing"}, {"table": "t", "project": ["bad"]}, {"table": "t", "filters": [("k", "bad", 1)]},
                  {"table": "t", "limit": (-1, 0)}, {"table": "t", "bogus": True}]:
        with pytest.raises(ValueError):
            plan(catalog(), query)


# @id TEST-PLAN-008 @verifies REQ-PLAN-008
def test_plan_008():
    c = catalog()
    result = execute_batch(c, [
        {"table": "t", "join": {"table": "r", "left": ["k"], "right": ["k"], "how": "inner"}, "project": ["r.name"]},
        {"table": "t", "group": [], "aggregates": {"total": ("sum", "v")}}
    ])
    assert result == [[{"r.name": "a"}, {"r.name": "b"}, {"r.name": "c"}], [{"total": 10}]]


# @id TEST-PLAN-009 @verifies REQ-PLAN-009
def test_plan_009():
    malformed = [
        {"filters": None}, {"project": "k"}, {"sort": 1}, {"limit": None},
        {"join": None}, {"group": "k", "aggregates": {}},
        {"group": [], "aggregates": []}, {"filters": [("k", [], 1)]},
        {"table": []}, {"group": [], "aggregates": {"a": None}},
    ]
    for delta in malformed:
        try:
            plan(catalog(), {"table": "t", **delta})
        except Exception as error:
            assert isinstance(error, ValueError), (delta, type(error))
        else:
            assert False, f"accepted malformed query: {delta}"


# @id TEST-PLAN-010 @verifies REQ-PLAN-010
def test_plan_010():
    c = catalog()
    p = plan(c, {"table": "t", "project": ["v"]})
    try:
        p.query["project"] += ("k",)
    except TypeError:
        pass
    assert execute(c, p) == [{"v": 4}, {"v": 3}, {"v": 2}, {"v": 1}, {"v": 0}]
    try:
        p.nodes[0]["table"] = "r"
    except TypeError:
        pass
    assert explain(p)["nodes"][0]["table"] == "t"
    query = {"table": "t", "join": {"table": "r", "left": ["k"], "right": ["k"], "how": "inner"},
             "group": ["r.name"], "aggregates": {"n": ("count_all", "l.k")}}
    joined = plan(c, query)
    expected = execute(c, joined)
    query["join"]["left"].clear()
    query["aggregates"].clear()
    assert execute(c, joined) == expected
    for container, key, value in [
        (joined.query["join"], "how", "anti"),
        (joined.query["aggregates"], "n", ("sum", "l.k")),
        (joined.nodes[1], "strategy", "merge"),
    ]:
        with pytest.raises((TypeError, AttributeError)):
            container[key] = value
        assert execute(c, joined) == expected


class Hook:
    calls = 0

    def __deepcopy__(self, memo):
        Hook.calls += 1
        return self


# @id TEST-PLAN-011 @verifies REQ-PLAN-011
def test_plan_011():
    for target in [Hook(), {"a"}, bytearray(b"a"), "1"]:
        for op in ["eq", "gt"]:
            with pytest.raises(ValueError):
                plan(catalog(), {"table": "t", "filters": [("k", op, target)]})
    assert Hook.calls == 0
    c = Catalog({"t": build_table({"k": [float("nan"), 1.0]}, 2)})
    assert execute(c, plan(c, {"table": "t", "filters": [("k", "eq", 1.0)]})) == [{"k": 1.0}]
