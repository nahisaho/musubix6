from m.b import g, Oops


# @id TEST-A-005
# @verifies REQ-A-001
def test_a_005_raise():
    def h():
        raise Oops("x")
    assert g(h) == "x"
