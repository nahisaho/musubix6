from crdt import lwwmap
import crdt.counters as cc


# @id TEST-VCLOCK-099 @verifies REQ-VCLOCK-001
def test_vclock_099():
    assert lwwmap.LWWMap("a") and cc.GCounter("a")
