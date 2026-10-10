import numpy as np
import pytest
from micrograd7.tensor import Tensor
from micrograd7.optim import SGD, Adam

# @id TEST-OPTIM-004 @verifies REQ-OPTIM-004
def test_optim_004():
    p=Tensor([2.],True); p.grad=np.array([4.]); Adam([p],lr=.1).step(); assert np.allclose(p.data,[1.9])
