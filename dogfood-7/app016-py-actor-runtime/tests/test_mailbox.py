import pytest
from actor_runtime.mailbox import Mailbox

# @id TEST-MAILBOX-001 @verifies REQ-MAILBOX-001 REQ-MAILBOX-002 REQ-MAILBOX-003 REQ-MAILBOX-004 REQ-MAILBOX-005 REQ-MAILBOX-006 REQ-MAILBOX-007 REQ-MAILBOX-008
def test_mailbox_001_contract():
    box = Mailbox(2)
    payload = {"items": [1]}
    assert box.send(payload)
    payload["items"].append(2)
    assert box.send("second")
    assert not box.send("overflow")
    assert box.size == 2
    box.close()
    assert not box.send("closed")
    assert box.receive() == {"items": [1]}
    assert box.receive() == "second"
    assert box.size == 0
    assert box.receive() is None
    for capacity in [0, -1]:
        with pytest.raises(ValueError):
            Mailbox(capacity)
    with pytest.raises(TypeError):
        Mailbox(1).send(object())
    with pytest.raises(TypeError):
        Mailbox(1).send(None)
