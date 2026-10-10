import numpy as np
import pytest
from micrograd7.check import gradcheck

# @id TEST-GRADCHECK-003 @verifies REQ-GRADCHECK-003
def test_gradcheck_003():
    assert gradcheck(lambda a,b:(a@b).mean(),[np.arange(6.).reshape(2,3),np.ones((3,2))])
