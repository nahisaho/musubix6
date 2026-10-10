import numpy as np
import pytest
from micrograd7.tensor import Tensor

# @id TEST-TENSOR-007 @verifies REQ-TENSOR-007
def test_tensor_007():
    assert Tensor([[1.,2.],[3.,4.]]).sum(axis=0,keepdims=True).data.tolist()==[[4.,6.]]
