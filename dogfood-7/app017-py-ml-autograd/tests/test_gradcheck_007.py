import numpy as np
import pytest
from micrograd7.check import gradcheck

# @id TEST-GRADCHECK-007 @verifies REQ-GRADCHECK-007
def test_gradcheck_007():
    a=np.array([1.,2.]); before=a.copy(); assert gradcheck(lambda x:(x/x).sum(),[a]); assert np.array_equal(a,before)
