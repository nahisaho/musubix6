import numpy as np
from micrograd7.tensor import Tensor

# @id TEST-TENSOR-009 @verifies REQ-TENSOR-009
def test_tensor_009():
    x = Tensor([3.], True)
    scalar = x.reshape(())
    assert scalar.shape == ()
    scalar.backward()
    assert np.array_equal(x.grad, [1.])
