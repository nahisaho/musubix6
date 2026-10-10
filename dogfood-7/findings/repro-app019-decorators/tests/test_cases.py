import pytest

# @id TEST-DECORATORS-001 @verifies REQ-DECORATORS-001
def test_decorators_001():
    assert True

@pytest.mark.parametrize("value", [1])
# @id TEST-DECORATORS-002 @verifies REQ-DECORATORS-002
def test_decorators_002(value):
    assert value == 1
