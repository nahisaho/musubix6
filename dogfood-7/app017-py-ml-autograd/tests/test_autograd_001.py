import numpy as np
import pytest
from micrograd7.tensor import Tensor

# @id TEST-AUTOGRAD-001 @verifies REQ-AUTOGRAD-001
def test_autograd_001():
    x=Tensor([2.],True); y=x*x; (y+y).sum().backward(); assert x.grad.tolist()==[8.]
