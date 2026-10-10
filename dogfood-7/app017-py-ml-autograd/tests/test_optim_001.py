import numpy as np
import pytest
from micrograd7.tensor import Tensor
from micrograd7.optim import SGD, Adam

# @id TEST-OPTIM-001 @verifies REQ-OPTIM-001
def test_optim_001():
    p=Tensor([2.],True); p.grad=np.array([3.]); SGD([p],lr=.1).step(); assert np.allclose(p.data,[1.7])
