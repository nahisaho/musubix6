from pkg.mod import Box, Color, helper


def setup_box():
    b = Box()
    return b, []


# @id TEST-M-001
# @verifies REQ-M-001
def test_m_001():
    box, log = setup_box()
    box.put(3)
    assert log == [3]


# @id TEST-M-002
# @verifies REQ-M-002
def test_m_002():
    assert Color.RED.value == "RED"
