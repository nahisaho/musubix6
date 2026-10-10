from scope_demo import api


# @id TEST-SCOPE-001 @verifies REQ-SCOPE-001
def test_scope_001():
    assert api.first() == 1


# @id TEST-SCOPE-002 @verifies REQ-SCOPE-002
def test_scope_002():
    assert api.unrelated() == 2
