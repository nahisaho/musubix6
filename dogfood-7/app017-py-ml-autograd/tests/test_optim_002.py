import numpy as np
import pytest
from micrograd7.tensor import Tensor
from micrograd7.optim import SGD, Adam

# @id TEST-OPTIM-002 @verifies REQ-OPTIM-002
def test_optim_002():
    p=Tensor([2.],True); p.grad=np.array([1.]); o=SGD([p],lr=.1,momentum=.5); o.step(); o.step(); assert np.allclose(p.data,[1.75])
