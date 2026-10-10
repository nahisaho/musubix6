import numpy as np
import pytest
from micrograd7.tensor import Tensor

# @id TEST-AUTOGRAD-008 @verifies REQ-AUTOGRAD-008
def test_autograd_008():
    x=Tensor(np.ones((2,3)),True); x.mean(axis=(-1,0)).backward(); assert np.allclose(x.grad,np.ones((2,3))/6)
