import pytest
from pkg.mod import Color, f

VALUES = [Color.RED]


# @id TEST-M-001
# @verifies REQ-M-001
def test_m_001():
    assert f() == 1
