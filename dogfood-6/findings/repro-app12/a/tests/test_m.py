from pkg.m import Thing


# @id TEST-M-001
# @verifies REQ-M-001
def test_m_001():
    assert Thing().a() == 1  # tweak


# @id TEST-M-002
# @verifies REQ-M-002
def test_m_002():
    assert Thing().b() == 2
