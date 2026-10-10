import numpy as np
import pytest
from micrograd7.tensor import Tensor
from micrograd7.optim import SGD, Adam

# @id TEST-OPTIM-007 @verifies REQ-OPTIM-007
def test_optim_007():
    with pytest.raises(ValueError): Adam([],lr=-1)
    with pytest.raises(ValueError): Adam([],betas=(1.,.9))
