import numpy as np
import pytest
from micrograd7.tensor import Tensor

# @id TEST-AUTOGRAD-007 @verifies REQ-AUTOGRAD-007
def test_autograd_007():
    x=Tensor([[1.,2.]],True); w=Tensor([[3.],[4.]],True); (x@w).sum().backward(); assert x.grad.tolist()==[[3.,4.]]; assert w.grad.tolist()==[[1.],[2.]]
