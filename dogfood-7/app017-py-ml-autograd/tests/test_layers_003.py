import numpy as np
import pytest
from micrograd7.tensor import Tensor
from micrograd7.optim import SGD
from micrograd7.nn import Linear, Sequential, ReLU, mse

# @id TEST-LAYERS-003 @verifies REQ-LAYERS-003
def test_layers_003():
    l=Linear(1,1); l.weight.data[:]=[[-1.]]; l.bias.data[:]=[0.]; assert Sequential(l,ReLU())(Tensor([[2.]])).data.tolist()==[[0.]]
