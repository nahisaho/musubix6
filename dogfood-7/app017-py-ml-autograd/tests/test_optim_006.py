import numpy as np
import pytest
from micrograd7.tensor import Tensor
from micrograd7.optim import SGD, Adam

# @id TEST-OPTIM-006 @verifies REQ-OPTIM-006
def test_optim_006():
    p=Tensor([2.],True); Adam([p]).step(); assert p.data.tolist()==[2.]
