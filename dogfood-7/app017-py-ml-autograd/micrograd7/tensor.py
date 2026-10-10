"""Small float64 tensor graph with first-order vector-Jacobian products."""
import numpy as np


def unbroadcast(gradient, shape):
    while gradient.ndim > len(shape):
        gradient = gradient.sum(axis=0)
    for axis, size in enumerate(shape):
        if size == 1 and gradient.shape[axis] != 1:
            gradient = gradient.sum(axis=axis, keepdims=True)
    return gradient.reshape(shape)


class Tensor:
    # @id CODE-TENSOR-001 @implements REQ-TENSOR-001
    def __init__(self, data, requires_grad=False, _parents=(), _vjp=None):
        self.data = np.array(data, dtype=np.float64, copy=True)
        self.requires_grad = bool(requires_grad)
        self.grad = None
        self._parents = tuple(_parents)
        self._vjp = _vjp

    @property
    def shape(self):
        return self.data.shape

    def _op(self, data, parents, vjp):
        return Tensor(data, any(p.requires_grad for p in parents), parents, vjp)

    @staticmethod
    def _tensor(value):
        return value if isinstance(value, Tensor) else Tensor(value)

    # @id CODE-TENSOR-002 @implements REQ-TENSOR-002 REQ-TENSOR-006
    def __add__(self, other):
        other = self._tensor(other)
        return self._op(self.data + other.data, (self, other), lambda g: (g, g))

    __radd__ = __add__

    # @id CODE-TENSOR-003 @implements REQ-TENSOR-003
    def __mul__(self, other):
        other = self._tensor(other)
        return self._op(self.data * other.data, (self, other),
                        lambda g: (g * other.data, g * self.data))

    __rmul__ = __mul__

    # @id CODE-TENSOR-004 @implements REQ-TENSOR-004
    def __neg__(self):
        return self * -1

    def __sub__(self, other):
        return self + -self._tensor(other)

    def __rsub__(self, other):
        return self._tensor(other) + -self

    # @id CODE-AUTOGRAD-009 @implements REQ-AUTOGRAD-009
    def __pow__(self, power):
        if not np.isscalar(power):
            raise TypeError("power must be scalar")
        return self._op(self.data ** power, (self,),
                        lambda g: (np.zeros_like(self.data) if power == 0 else
                                   g * power * self.data ** (power - 1),))

    # @id CODE-TENSOR-005 @implements REQ-TENSOR-005
    def __truediv__(self, other):
        return self * self._tensor(other) ** -1

    def __rtruediv__(self, other):
        return self._tensor(other) * self ** -1

    # @id CODE-TENSOR-007 @implements REQ-TENSOR-007
    def sum(self, axis=None, keepdims=False):
        axes = tuple(range(self.data.ndim)) if axis is None else (
            (axis,) if isinstance(axis, int) else tuple(axis))
        axes = tuple(a % self.data.ndim for a in axes) if self.data.ndim else ()

        def vjp(g):
            if not keepdims:
                for a in sorted(axes):
                    g = np.expand_dims(g, a)
            return (np.broadcast_to(g, self.shape),)

        return self._op(self.data.sum(axis=axis, keepdims=keepdims), (self,), vjp)

    # @id CODE-AUTOGRAD-008 @implements REQ-AUTOGRAD-008
    def mean(self, axis=None, keepdims=False):
        axes = range(self.data.ndim) if axis is None else (
            (axis,) if isinstance(axis, int) else tuple(axis))
        count = np.prod([self.shape[a] for a in axes], dtype=int)
        return self.sum(axis=axis, keepdims=keepdims) / count

    # @id CODE-TENSOR-008 @implements REQ-TENSOR-008
    # @id CODE-TENSOR-009 @implements REQ-TENSOR-009
    def reshape(self, *shape):
        if len(shape) == 1 and isinstance(shape[0], (tuple, list)):
            shape = tuple(shape[0])
        return self._op(self.data.reshape(shape), (self,),
                        lambda g: (g.reshape(self.shape),))

    # @id CODE-AUTOGRAD-010 @implements REQ-AUTOGRAD-010
    def transpose(self, axes=None):
        axes = tuple(reversed(range(self.data.ndim))) if axes is None else tuple(axes)
        data = self.data.transpose(axes)
        axes = tuple(a % self.data.ndim for a in axes)
        inverse = np.argsort(axes)
        return self._op(data, (self,),
                        lambda g: (g.transpose(inverse),))

    @property
    def T(self):
        return self.transpose()

    # @id CODE-AUTOGRAD-005 @implements REQ-AUTOGRAD-005
    def exp(self):
        out = np.exp(self.data)
        return self._op(out, (self,), lambda g: (g * out,))

    def log(self):
        return self._op(np.log(self.data), (self,), lambda g: (g / self.data,))

    # @id CODE-AUTOGRAD-006 @implements REQ-AUTOGRAD-006
    def relu(self):
        return self._op(np.maximum(self.data, 0), (self,),
                        lambda g: (g * (self.data > 0),))

    # @id CODE-AUTOGRAD-007 @implements REQ-AUTOGRAD-007
    def __matmul__(self, other):
        other = self._tensor(other)
        if self.data.ndim != 2 or other.data.ndim != 2:
            raise ValueError("matmul currently requires two matrices")
        return self._op(self.data @ other.data, (self, other),
                        lambda g: (g @ other.data.T, self.data.T @ g))

    # @id CODE-AUTOGRAD-001 @implements REQ-AUTOGRAD-001 REQ-AUTOGRAD-002 REQ-AUTOGRAD-003 REQ-AUTOGRAD-004
    def backward(self, seed=None):
        if seed is None:
            if self.data.ndim != 0:
                raise ValueError("a non-scalar output requires a seed")
            seed = np.ones_like(self.data)
        seed = np.asarray(seed, dtype=float)
        if seed.shape != self.shape:
            raise ValueError("seed shape must exactly equal output shape")
        if not self.requires_grad:
            return
        order, seen = [], set()
        stack = [(self, False)]
        while stack:
            node, expanded = stack.pop()
            if expanded:
                order.append(node)
            elif id(node) not in seen:
                seen.add(id(node))
                stack.append((node, True))
                stack.extend((parent, False) for parent in node._parents)
        gradients = {id(self): seed.copy()}
        for node in reversed(order):
            gradient = gradients.get(id(node))
            if gradient is None:
                continue
            if not node._parents:
                node.grad = gradient.copy() if node.grad is None else node.grad + gradient
            elif node._vjp:
                for parent, contribution in zip(node._parents, node._vjp(gradient)):
                    if parent.requires_grad:
                        contribution = unbroadcast(np.asarray(contribution), parent.shape)
                        gradients[id(parent)] = gradients.get(id(parent), 0) + contribution

    def detach(self):
        return Tensor(self.data)
