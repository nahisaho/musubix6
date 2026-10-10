import numpy as np
import pytest
from micrograd7.tensor import Tensor
from micrograd7.nn import Module

# @id TEST-LAYERS-009 @verifies REQ-LAYERS-009
def test_layers_009():
    module = Module()
    module.vector = Tensor([1., 2.], True)
    module.scalar = Tensor(3., True)
    module.load_state_dict({"vector": np.array([4., 5.]), "scalar": np.array(6.)})
    assert module.vector.data.tolist() == [4., 5.]
    assert module.scalar.data == 6.
    with pytest.raises(ValueError):
        module.load_state_dict({"vector": np.array([7., 8.]), "scalar": np.array([9.])})
    assert module.vector.data.tolist() == [4., 5.]
    assert module.scalar.data == 6.
