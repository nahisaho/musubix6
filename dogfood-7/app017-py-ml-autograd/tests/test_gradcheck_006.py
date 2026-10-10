import numpy as np
import pytest
from micrograd7.check import gradcheck

# @id TEST-GRADCHECK-006 @verifies REQ-GRADCHECK-006
def test_gradcheck_006():
    with pytest.raises(ValueError): gradcheck(lambda x:x*x,[np.array([1.,2.])])
