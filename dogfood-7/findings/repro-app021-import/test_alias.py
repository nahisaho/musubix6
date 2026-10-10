from source import right as read

# @id TEST-ALIAS-001 @verifies REQ-ALIAS-001
def test_alias_001():
    assert read() == 1
