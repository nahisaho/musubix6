import numpy as np
import pytest
from micrograd7.check import gradcheck

# @id TEST-GRADCHECK-004 @verifies REQ-GRADCHECK-004
def test_gradcheck_004():
    rng=np.random.default_rng(13)
    for _ in range(15):
        a=rng.uniform(.3,1.5,(2,3)); assert gradcheck(lambda x:(x.log()+x.exp()+x**2).mean(),[a])
