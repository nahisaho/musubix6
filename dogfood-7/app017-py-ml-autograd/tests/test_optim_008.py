import numpy as np
import pytest
from micrograd7.tensor import Tensor
from micrograd7.optim import SGD, Adam

# @id TEST-OPTIM-008 @verifies REQ-OPTIM-008
def test_optim_008():
    p=Tensor([2.],True); p.grad=np.array([2.]); a=Adam([p]); a.step(); state=a.state_dict(); q=Tensor(p.data,True); q.grad=p.grad.copy(); b=Adam([q]); b.load_state_dict(state); a.step(); b.step(); assert np.array_equal(p.data,q.data); state['m'][0][0]=999; assert b.state_dict()['m'][0][0]!=999
