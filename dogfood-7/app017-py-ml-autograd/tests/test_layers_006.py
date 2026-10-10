import numpy as np
import pytest
from micrograd7.tensor import Tensor
from micrograd7.optim import SGD
from micrograd7.nn import Linear, Sequential, ReLU, mse

# @id TEST-LAYERS-006 @verifies REQ-LAYERS-006
def test_layers_006():
    l=Linear(1,1); s=Sequential(l,ReLU()); s.train(False); assert not s.training and not l.training and not s.layers[1].training
