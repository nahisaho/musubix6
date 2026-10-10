import numpy as np
import pytest
from micrograd7.tensor import Tensor
from micrograd7.optim import SGD, Adam

# @id TEST-OPTIM-005 @verifies REQ-OPTIM-005
def test_optim_005():
    p=Tensor([2.],True); p.grad=np.array([1.]); SGD([p]).zero_grad(); assert p.grad is None
