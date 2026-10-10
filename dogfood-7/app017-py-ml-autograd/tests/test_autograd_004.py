import numpy as np
import pytest
from micrograd7.tensor import Tensor

# @id TEST-AUTOGRAD-004 @verifies REQ-AUTOGRAD-004
def test_autograd_004():
    x=Tensor([2.,3.],True); (x*x).backward([2.,1.]); assert x.grad.tolist()==[8.,6.]
    with pytest.raises(ValueError):
        (x*x).backward()
    with pytest.raises(ValueError):
        (x*x).backward([1.])
