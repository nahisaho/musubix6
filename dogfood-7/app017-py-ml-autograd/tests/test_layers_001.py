import numpy as np
import pytest
from micrograd7.tensor import Tensor
from micrograd7.optim import SGD
from micrograd7.nn import Linear, Sequential, ReLU, mse

# @id TEST-LAYERS-001 @verifies REQ-LAYERS-001
def test_layers_001():
    l=Linear(2,1,seed=1); l.weight.data[:]=[[2.],[3.]]; l.bias.data[:]=[1.]; assert l(Tensor([[1.,2.]])).data.tolist()==[[9.]]
