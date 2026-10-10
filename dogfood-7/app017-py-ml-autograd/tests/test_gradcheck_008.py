import numpy as np
import pytest
from micrograd7.check import gradcheck

# @id TEST-GRADCHECK-008 @verifies REQ-GRADCHECK-008
def test_gradcheck_008():
    weights=np.arange(1.,7.).reshape(3,2)
    assert gradcheck(lambda x:((x.reshape(2,3).T**2)*weights).sum(),[np.arange(1.,7.)])
