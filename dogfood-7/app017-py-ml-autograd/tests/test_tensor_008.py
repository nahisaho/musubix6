import numpy as np
import pytest
from micrograd7.tensor import Tensor

# @id TEST-TENSOR-008 @verifies REQ-TENSOR-008
def test_tensor_008():
    assert Tensor([1.,2.,3.,4.]).reshape(2,2).T.data.tolist()==[[1.,3.],[2.,4.]]
