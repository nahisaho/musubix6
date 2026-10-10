import numpy as np
import pytest
from micrograd7.tensor import Tensor
from micrograd7.optim import SGD

# @id TEST-OPTIM-009 @verifies REQ-OPTIM-009
def test_optim_009():
    p = Tensor([2.], True)
    p.grad = np.array([2.])
    a = SGD([p], lr=.2, momentum=.8, weight_decay=.1)
    a.step()
    state = a.state_dict()
    q = Tensor(p.data, True)
    q.grad = p.grad.copy()
    b = SGD([q])
    b.load_state_dict(state)
    state["velocity"][0][:] = 999
    a.step()
    b.step()
    assert np.array_equal(p.data, q.data)
    before = b.state_dict()
    invalid = b.state_dict()
    invalid["velocity"][0] = np.ones((2,))
    invalid["lr"] = .9
    with pytest.raises(ValueError):
        b.load_state_dict(invalid)
    assert b.lr == before["lr"]
    assert np.array_equal(b.velocity[0], before["velocity"][0])
