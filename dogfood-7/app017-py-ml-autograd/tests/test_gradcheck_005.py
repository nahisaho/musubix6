import numpy as np
import pytest
from micrograd7.check import gradcheck

# @id TEST-GRADCHECK-005 @verifies REQ-GRADCHECK-005
def test_gradcheck_005():
    def bad(x):
        y=x*x; y._vjp=lambda g:(np.zeros_like(x.data),); return y.sum()
    assert not gradcheck(bad,[np.array([2.])])
