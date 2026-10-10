import numpy as np
import pytest
from micrograd7.tensor import Tensor

# @id TEST-TENSOR-001 @verifies REQ-TENSOR-001
def test_tensor_001():
    x=np.array([1.,2.]); t=Tensor(x); x[0]=9; assert t.data.tolist()==[1.,2.]
