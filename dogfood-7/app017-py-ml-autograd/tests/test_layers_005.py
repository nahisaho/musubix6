import numpy as np
import pytest
from micrograd7.tensor import Tensor
from micrograd7.optim import SGD
from micrograd7.nn import Linear, Sequential, ReLU, mse

# @id TEST-LAYERS-005 @verifies REQ-LAYERS-005
def test_layers_005():
    l=Linear(2,1); original=l.weight.data.copy(); state=l.state_dict(); state['weight'][:]=3
    assert np.array_equal(l.weight.data,original)
    l.load_state_dict(state); state['weight'][:]=9; assert np.all(l.weight.data==3)
    l.weight.data[:]=4; assert np.all(state['weight']==9)
