import numpy as np
import pytest
from micrograd7.tensor import Tensor

# @id TEST-TENSOR-003 @verifies REQ-TENSOR-003
def test_tensor_003():
    assert (Tensor([[1.],[2.]])*Tensor([3.,4.])).data.tolist()==[[3.,4.],[6.,8.]]
