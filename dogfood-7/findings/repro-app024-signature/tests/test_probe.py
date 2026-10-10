# @id TEST-PROBE-002 @verifies REQ-PROBE-002
def test_probe_002():
    assert 1 + 1 == 2

def test_probe_001(
    allowed=True,
):
    """@id TEST-PROBE-001 @verifies REQ-PROBE-001"""
    assert allowed is True
