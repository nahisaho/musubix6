"""Central finite-difference oracle for scalar, first-order tensor graphs."""
import numpy as np
from .tensor import Tensor


# @id CODE-GRADCHECK-001 @implements REQ-GRADCHECK-001 REQ-GRADCHECK-002 REQ-GRADCHECK-003 REQ-GRADCHECK-004 REQ-GRADCHECK-005 REQ-GRADCHECK-006 REQ-GRADCHECK-007 REQ-GRADCHECK-008
# @id CODE-GRADCHECK-009 @implements REQ-GRADCHECK-009
# @id CODE-GRADCHECK-010 @implements REQ-GRADCHECK-010
def gradcheck(function, inputs, eps=1e-6, atol=1e-5, rtol=1e-4):
    if not np.isfinite(eps) or eps <= 0 or atol < 0 or rtol < 0:
        raise ValueError("invalid finite-difference tolerances")
    arrays = [np.array(value, dtype=float, copy=True) for value in inputs]
    tensors = [Tensor(value, True) for value in arrays]
    output = function(*tensors)
    if not isinstance(output, Tensor) or output.data.ndim != 0:
        raise ValueError("gradcheck requires a scalar Tensor output")
    if not np.isfinite(output.data).all():
        return False
    output.backward()
    for operand, tensor in enumerate(tensors):
        numerical = np.zeros_like(arrays[operand])
        for index in np.ndindex(arrays[operand].shape):
            plus, minus = [a.copy() for a in arrays], [a.copy() for a in arrays]
            plus[operand][index] += eps
            minus[operand][index] -= eps
            high = function(*(Tensor(a) for a in plus))
            low = function(*(Tensor(a) for a in minus))
            if high.data.ndim != 0 or low.data.ndim != 0:
                raise ValueError("perturbed outputs must remain scalar")
            if not np.isfinite(high.data).all() or not np.isfinite(low.data).all():
                return False
            numerical[index] = (float(high.data) / 2 - float(low.data) / 2) / eps
        analytic = np.zeros_like(tensor.data) if tensor.grad is None else tensor.grad
        if not np.isfinite(analytic).all() or not np.isfinite(numerical).all():
            return False
        if not np.allclose(analytic, numerical, atol=atol, rtol=rtol):
            return False
    return True
