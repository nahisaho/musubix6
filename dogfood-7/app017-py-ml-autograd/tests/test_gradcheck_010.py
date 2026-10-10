import numpy as np
from micrograd7.check import gradcheck

# @id TEST-GRADCHECK-010 @verifies REQ-GRADCHECK-010
def test_gradcheck_010():
    assert gradcheck(lambda x: (x*0 + 1e308).sum(), [np.array([0.])])
