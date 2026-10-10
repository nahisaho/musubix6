import numpy as np
import pytest
from micrograd7.tensor import Tensor
from micrograd7.optim import SGD
from micrograd7.nn import Linear, Sequential, ReLU, mse

# @id TEST-LAYERS-002 @verifies REQ-LAYERS-002
def test_layers_002():
    l=Linear(2,1); s=Sequential(l,l); assert len(s.parameters())==2
