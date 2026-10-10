import numpy as np
import pytest
from micrograd7.tensor import Tensor

# @id TEST-TENSOR-004 @verifies REQ-TENSOR-004
def test_tensor_004():
    assert (3-Tensor([1.,2.])).data.tolist()==[2.,1.]
