import numpy as np
import pytest
from micrograd7.tensor import Tensor

# @id TEST-TENSOR-005 @verifies REQ-TENSOR-005
def test_tensor_005():
    assert (6/Tensor([2.,3.])).data.tolist()==[3.,2.]
