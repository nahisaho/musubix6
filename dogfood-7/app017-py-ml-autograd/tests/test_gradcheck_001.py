import numpy as np
import pytest
from micrograd7.check import gradcheck

# @id TEST-GRADCHECK-001 @verifies REQ-GRADCHECK-001
def test_gradcheck_001():
    assert gradcheck(lambda x:(x*x*x).sum(),[np.array([.4,1.2])])
