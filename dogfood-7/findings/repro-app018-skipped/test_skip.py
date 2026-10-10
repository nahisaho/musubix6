import pytest
from subject import value, disabled


# @id TEST-SKIP-001
# @verifies REQ-SKIP-001
@pytest.mark.skipif(disabled(), reason="no execution")
def test_skip_001():
    assert value() == 1
