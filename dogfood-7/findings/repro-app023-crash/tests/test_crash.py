from value import value


# @id TEST-CRASH-001 @verifies REQ-CRASH-001
def test_crash_001():
    assert value() == 42
