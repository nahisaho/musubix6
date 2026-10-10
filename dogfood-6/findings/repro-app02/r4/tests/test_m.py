from pkg.eng import Eng


def make():
    log = []
    return Eng(log), log


# @id TEST-M-001
# @verifies REQ-M-001
def test_m_001():
    eng, log = make()
    eng.run()
    assert log.count("x") == 1
    assert len(log) == 1
