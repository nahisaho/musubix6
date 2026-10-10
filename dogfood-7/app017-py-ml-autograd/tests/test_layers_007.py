import numpy as np
import pytest
from micrograd7.tensor import Tensor
from micrograd7.optim import SGD
from micrograd7.nn import Linear, Sequential, ReLU, mse

# @id TEST-LAYERS-007 @verifies REQ-LAYERS-007
def test_layers_007():
    x=Tensor([2.],True); y=x.detach(); y.data[0]=7; assert x.data.tolist()==[2.] and not y.requires_grad
