from alias_demo import api as renamed


# @id TEST-ALIAS-001 @verifies REQ-ALIAS-001
def test_alias_001():
    assert renamed.first() == 1
