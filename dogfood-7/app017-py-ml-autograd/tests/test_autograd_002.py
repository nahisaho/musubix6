import numpy as np
import pytest
from micrograd7.tensor import Tensor

# @id TEST-AUTOGRAD-002 @verifies REQ-AUTOGRAD-002
def test_autograd_002():
    x=Tensor([[1.],[2.]],True); y=Tensor([3.,4.],True); (x*y).sum().backward(); assert x.grad.tolist()==[[7.],[7.]]; assert y.grad.tolist()==[3.,3.]
