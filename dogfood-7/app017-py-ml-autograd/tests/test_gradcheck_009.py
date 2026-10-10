import numpy as np
from micrograd7.check import gradcheck

# @id TEST-GRADCHECK-009 @verifies REQ-GRADCHECK-009
def test_gradcheck_009():
    def bad(x):
        y = x * 1e308
        y._vjp = lambda g: (np.full_like(x.data, np.inf), np.zeros(()))
        return y.sum()

    with np.errstate(over="ignore", invalid="ignore"):
        assert not gradcheck(bad, [np.array([0.])], eps=1.)
        assert gradcheck(lambda x: (x * 1e308).sum(), [np.array([0.])], eps=1.)
        assert not gradcheck(lambda x: (x * 1e308).sum(), [np.array([0.])], eps=2.)
