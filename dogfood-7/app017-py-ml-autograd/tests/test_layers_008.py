import numpy as np
import pytest
from micrograd7.tensor import Tensor
from micrograd7.optim import SGD
from micrograd7.nn import Linear, Sequential, ReLU, mse

# @id TEST-LAYERS-008 @verifies REQ-LAYERS-008
def test_layers_008():
    x=Tensor(np.arange(10.).reshape(-1,1)/10); target=x*2+1; l=Linear(1,1,seed=4); o=SGD(l.parameters(),lr=.2); initial=float(mse(l(x),target).data)
    for _ in range(100):
        o.zero_grad(); loss=mse(l(x),target); loss.backward(); o.step()
    assert float(mse(l(x),target).data)<initial/100
