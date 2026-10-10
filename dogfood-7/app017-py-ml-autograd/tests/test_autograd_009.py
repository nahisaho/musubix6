import numpy as np
from micrograd7.tensor import Tensor

# @id TEST-AUTOGRAD-009 @verifies REQ-AUTOGRAD-009
def test_autograd_009():
    x = Tensor([0., 2.], True)
    (x**0).sum().backward()
    assert np.array_equal(x.grad, [0., 0.])
