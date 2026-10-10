from m.a import f


# @id TEST-A-001
# @verifies REQ-A-001
def test_a_001_chain():
    for seed in range(3):
        v = f(seed)
        assert 4.0 <= v <= 8.0


# @id TEST-A-002
# @verifies REQ-A-001
def test_a_002_plain():
    for seed in range(3):
        v = f(seed)
        assert v >= 4.0


# @id TEST-A-003
# @verifies REQ-A-001
def test_a_003_tuple():
    r = f(1)
    assert (r.x, r.y) == (1, 2)


# @id TEST-A-004
# @verifies REQ-A-001
def test_a_004_attr():
    r = f(1)
    assert r.x == 1 and r.y == 2
