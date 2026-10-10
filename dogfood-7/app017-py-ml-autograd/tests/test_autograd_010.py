import numpy as np
from micrograd7.tensor import Tensor

# @id TEST-AUTOGRAD-010 @verifies REQ-AUTOGRAD-010
def test_autograd_010():
    x = Tensor(np.arange(1.,25.).reshape(2,3,4), True)
    weights = np.arange(1.,25.).reshape(2,4,3)
    (x.transpose((0,-1,1))*weights).sum().backward()
    assert np.array_equal(x.grad, weights.transpose(0,2,1))
