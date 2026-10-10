import pytest
import os

# @id TEST-SKIPPED-001 @verifies REQ-SKIPPED-001
def test_skipped_001():
    if os.environ.get("REPRO_VERDICT") == "skip":
        pytest.skip("assertion never executes")
    if os.environ.get("REPRO_VERDICT") == "xfail":
        pytest.xfail("assertion never executes")
    assert False
