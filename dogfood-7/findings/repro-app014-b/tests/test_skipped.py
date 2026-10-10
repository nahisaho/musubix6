import pytest


# @id TEST-SKIPPED-001 @verifies REQ-SKIPPED-001
@pytest.mark.skip(reason="never executes")
def test_skipped_001():
    assert False
