import numpy as np
import pytest
from micrograd7.check import gradcheck

# @id TEST-GRADCHECK-002 @verifies REQ-GRADCHECK-002
def test_gradcheck_002():
    assert gradcheck(lambda x,y:(x*y+y).sum(),[np.ones((2,1)),np.array([.3,.8,.9])])
