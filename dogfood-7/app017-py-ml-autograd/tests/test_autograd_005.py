import numpy as np
import pytest
from micrograd7.tensor import Tensor

# @id TEST-AUTOGRAD-005 @verifies REQ-AUTOGRAD-005
def test_autograd_005():
    x=Tensor([1.,2.],True); x.exp().log().sum().backward(); assert np.allclose(x.grad,[1.,1.])
