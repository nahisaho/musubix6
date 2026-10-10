import numpy as np
import pytest
from micrograd7.tensor import Tensor
from micrograd7.optim import SGD, Adam

# @id TEST-OPTIM-003 @verifies REQ-OPTIM-003
def test_optim_003():
    p=Tensor([2.],True); p.grad=np.array([0.]); SGD([p],lr=.1,weight_decay=.5).step(); assert np.allclose(p.data,[1.9])
