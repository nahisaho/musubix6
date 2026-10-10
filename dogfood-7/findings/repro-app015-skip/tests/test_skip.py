import pytest
import os


# @id TEST-SKIP-001 @verifies REQ-SKIP-001
@pytest.mark.skip(reason="assertion never runs")
def test_skip_001():
    assert False


# @id TEST-SKIP-002 @verifies REQ-SKIP-002
@pytest.mark.skipif(os.environ.get("APP015_SKIP") == "1", reason="assertion never runs")
def test_skip_002():
    assert False
