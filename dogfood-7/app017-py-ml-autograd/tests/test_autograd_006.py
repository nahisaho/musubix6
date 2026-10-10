import numpy as np
import pytest
from micrograd7.tensor import Tensor

# @id TEST-AUTOGRAD-006 @verifies REQ-AUTOGRAD-006
def test_autograd_006():
    x=Tensor([-1.,0.,2.],True); x.relu().sum().backward(); assert x.grad.tolist()==[0.,0.,1.]
