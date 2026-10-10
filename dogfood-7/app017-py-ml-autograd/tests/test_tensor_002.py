import numpy as np
import pytest
from micrograd7.tensor import Tensor

# @id TEST-TENSOR-002 @verifies REQ-TENSOR-002
def test_tensor_002():
    assert (Tensor([[1.,2.]])+3).data.tolist()==[[4.,5.]]
