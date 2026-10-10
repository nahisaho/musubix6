from missing_probe_module import calculate

# @id TEST-PROBE-001 @verifies REQ-PROBE-001
def test_probe_001():
    assert calculate() == 1
