import pytest
import json
from dataflow.clock import Event
from dataflow.engine import Engine
from dataflow.checkpoint import dumps, loads

# @id TEST-SNAPSHOT-001 @verifies REQ-SNAPSHOT-001
def test_snapshot_001():
    e = Engine(size=7, late_policy="side")
    e.process(Event(1, "a", 2))
    e.advance(2)
    restored = loads(dumps(e))
    assert restored.options == e.options
    assert restored.watermark == 2
    assert restored.advance(7) == e.advance(7)

# @id TEST-SNAPSHOT-002 @verifies REQ-SNAPSHOT-002
def test_snapshot_002():
    e = Engine(size=10)
    e.process(Event(1, "a", 2))
    r = loads(dumps(e))
    for engine in (e, r):
        engine.process(Event(5, "a", 3))
        engine.process(Event(12, "b", 7))
    assert r.advance(20) == e.advance(20)

# @id TEST-SNAPSHOT-003 @verifies REQ-SNAPSHOT-003
def test_snapshot_003():
    e = Engine()
    doc = json.loads(dumps(e))
    doc["payload"]["watermark"] = 90
    with pytest.raises(ValueError, match="integrity"):
        loads(json.dumps(doc))

# @id TEST-SNAPSHOT-004 @verifies REQ-SNAPSHOT-004
def test_snapshot_004():
    doc = json.loads(dumps(Engine()))
    doc["version"] = 99
    with pytest.raises(ValueError, match="version"):
        loads(json.dumps(doc))

# @id TEST-SNAPSHOT-005 @verifies REQ-SNAPSHOT-005
def test_snapshot_005():
    a, b = Engine(), Engine()
    for t, key in ((1, "a"), (2, "b")):
        a.process(Event(t, key, 1))
    for t, key in ((2, "b"), (1, "a")):
        b.process(Event(t, key, 1))
    assert dumps(a) == dumps(b)

# @id TEST-SNAPSHOT-006 @verifies REQ-SNAPSHOT-006
def test_snapshot_006():
    e = Engine()
    e.process(Event(1, "a", 1))
    encoded = dumps(e)
    e.process(Event(2, "a", 3))
    assert loads(encoded).advance(10)[0]["count"] == 1
    assert e.advance(10)[0]["count"] == 2

# @id TEST-SNAPSHOT-007 @verifies REQ-SNAPSHOT-007
def test_snapshot_007():
    e = Engine(mode="session", gap=5)
    e.process(Event(0, "a", 1))
    e.process(Event(8, "a", 2))
    r = loads(dumps(e))
    r.process(Event(4, "a", 3))
    assert r.advance(13)[0]["sum"] == 6
    large = Engine(mode="session", gap=0.3)
    large.process(Event(1e15, "a", 1))
    assert loads(dumps(large)).advance(1e15 + 1)[0]["sum"] == 1

# @id TEST-SNAPSHOT-008 @verifies REQ-SNAPSHOT-008
def test_snapshot_008():
    a = Engine(late_policy="side")
    a.advance(10)
    a.process(Event(1, "a", 1, "p"))
    b = Engine(late_policy="drop")
    b.advance(10)
    b.process(Event(1, "a", 1))
    assert loads(dumps(a)).late == a.late
    assert loads(dumps(b)).dropped == 1


# @id TEST-SNAPSHOT-009 @verifies REQ-SNAPSHOT-009
def test_snapshot_009():
    import hashlib
    from dataflow.checkpoint import canonical
    from copy import deepcopy
    e = Engine()
    e.process(Event(1, "a", 3))
    base = json.loads(dumps(e))
    mutations = [
        lambda p: p.update(sessions=[]),
        lambda p: p.update(dropped=-1),
        lambda p: p["windows"][0].update(aggregate={}),
        lambda p: p["windows"][0].update(start=10),
        lambda p: p["windows"][0]["aggregate"].update(count=0),
        lambda p: p.update(watermark=10),
        lambda p: p["windows"][0].update(end=11),
        lambda p: p["windows"][0]["aggregate"].update(sum=999),
    ]
    for mutation in mutations:
        doc = deepcopy(base)
        mutation(doc["payload"])
        doc["digest"] = hashlib.sha256(canonical(doc["payload"]).encode()).hexdigest()
        with pytest.raises(ValueError):
            loads(json.dumps(doc))
