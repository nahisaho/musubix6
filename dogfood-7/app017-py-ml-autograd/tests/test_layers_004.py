import numpy as np
import pytest
from micrograd7.tensor import Tensor
from micrograd7.optim import SGD
from micrograd7.nn import Linear, Sequential, ReLU, mse

# @id TEST-LAYERS-004 @verifies REQ-LAYERS-004
def test_layers_004():
    p=Tensor([1.,3.],True); loss=mse(p,Tensor([0.,1.])); loss.backward(); assert loss.data==2.5; assert np.allclose(p.grad,[1.,2.])
