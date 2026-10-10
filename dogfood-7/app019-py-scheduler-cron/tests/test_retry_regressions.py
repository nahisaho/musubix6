from scheduler.dispatch import retry_delay

# @id TEST-DISPATCH-009 @verifies REQ-DISPATCH-009
def test_dispatch_009():
    assert retry_delay(10000, 0.5, 60.0) == 60.0
    assert retry_delay(10000, 0.0, 60.0) == 0.0
    assert retry_delay(10000, 0.5, 0.0) == 0.0
    assert retry_delay(3, 0.5, 60.0) == 2.0
