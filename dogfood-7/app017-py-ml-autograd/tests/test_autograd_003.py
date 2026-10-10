import numpy as np
import pytest
from micrograd7.tensor import Tensor

# @id TEST-AUTOGRAD-003 @verifies REQ-AUTOGRAD-003
def test_autograd_003():
    x=Tensor([2.],True); y=(x*x).sum(); y.backward(); y.backward(); assert x.grad.tolist()==[8.]
