import pytest
from actor_runtime.remoting import Network
from actor_runtime.scheduler import Runtime

# @id TEST-REMOTING-001 @verifies REQ-REMOTING-001 REQ-REMOTING-002 REQ-REMOTING-003 REQ-REMOTING-004 REQ-REMOTING-005 REQ-REMOTING-006 REQ-REMOTING-007 REQ-REMOTING-008
def test_remoting_001_contract():
    net = Network(latency=2)
    a, b = Runtime(), Runtime()
    seen = []
    b.spawn("sink", lambda rt, name, msg: seen.append(msg), capacity=2)
    net.register("a", a)
    net.register("b", b)
    with pytest.raises(ValueError):
        net.register("a", a)
    with pytest.raises(ValueError):
        net.send("unknown", "b", "sink", 0)
    payload = {"items": [1]}
    net.send("a", "b", "sink", payload)
    payload["items"].append(2)
    net.send("a", "b", "sink", "second")
    net.advance(1)
    assert b.run(10) == 0
    net.advance(1)
    assert b.run(10) == 2
    assert seen == [{"items": [1]}, "second"]
    net.send("a", "b", "sink", "partitioned")
    net.partition("b", "a")
    net.advance(2)
    assert len(net.dead_letters) == 1
    net.heal("a", "b")
    net.send("a", "b", "sink", "healed")
    net.advance(2)
    b.run(1)
    assert seen[-1] == "healed"
    net.send("a", "b", "missing", "lost")
    net.send("a", "b", "sink", 1)
    net.send("a", "b", "sink", 2)
    net.send("a", "b", "sink", 3)
    net.advance(2)
    assert len(net.dead_letters) == 3
    with pytest.raises(ValueError):
        Network(latency=-1)
    clock = net.time
    with pytest.raises(ValueError):
        net.advance(-1)
    assert net.time == clock

# @id TEST-REMOTING-002 @verifies REQ-MAILBOX-009 REQ-REMOTING-009
def test_remoting_002_deep_payload():
    from actor_runtime.mailbox import Mailbox
    source, destination = Runtime(), Runtime()
    received = []
    destination.spawn("sink", lambda rt, name, value: received.append(value))
    network = Network(latency=0)
    network.register("a", source)
    network.register("b", destination)
    payload = {"value": 1}
    original_leaf = payload
    for _ in range(1500):
        payload = [payload]
    network.send("a", "b", "sink", payload)
    original_leaf["value"] = 99
    assert network.advance(0) == 1
    assert destination.run(1) == 1
    copied = received[0]
    for _ in range(1500):
        copied = copied[0]
    assert copied == {"value": 1}
    mailbox = Mailbox(1)
    assert mailbox.send(payload)
    original_leaf["value"] = 100
    copied = mailbox.receive()
    for _ in range(1500):
        copied = copied[0]
    assert copied == {"value": 99}
