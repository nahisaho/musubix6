import numpy as np
import pytest
from micrograd7.tensor import Tensor

# @id TEST-TENSOR-006 @verifies REQ-TENSOR-006
def test_tensor_006():
    with pytest.raises(ValueError): Tensor([1.,2.])+Tensor([1.,2.,3.])
