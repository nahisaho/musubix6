import pytest

# @id TEST-SKIP-001 @verifies REQ-SKIP-001
def test_skip_001():
    pytest.skip("probe intentionally executes no assertion")
    assert False
