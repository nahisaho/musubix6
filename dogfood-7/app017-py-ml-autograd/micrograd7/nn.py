"""Composable modules, shared parameter discovery and atomic state loading."""
import numpy as np
from .tensor import Tensor


class Module:
    def __init__(self):
        self.training = True

    def __call__(self, x):
        return self.forward(x)

    def children(self):
        result = []
        for value in vars(self).values():
            if isinstance(value, Module):
                result.append(value)
            elif isinstance(value, (list, tuple)):
                result.extend(item for item in value if isinstance(item, Module))
        return result

    def named_parameters(self):
        found, visited = set(), set()

        def walk(module, prefix):
            if id(module) in visited:
                return
            visited.add(id(module))
            for name, value in vars(module).items():
                path = f"{prefix}{name}"
                if isinstance(value, Tensor) and value.requires_grad and id(value) not in found:
                    found.add(id(value))
                    yield path, value
                elif isinstance(value, Module):
                    yield from walk(value, path + ".")
                elif isinstance(value, (list, tuple)):
                    for i, child in enumerate(value):
                        if isinstance(child, Module):
                            yield from walk(child, path + f".{i}.")
        return dict(walk(self, ""))

    # @id CODE-LAYERS-002 @implements REQ-LAYERS-002
    def parameters(self):
        return list(self.named_parameters().values())

    # @id CODE-LAYERS-005 @implements REQ-LAYERS-005
    def state_dict(self):
        return {name: p.data.copy() for name, p in self.named_parameters().items()}

    # @id CODE-LAYERS-009 @implements REQ-LAYERS-009
    def load_state_dict(self, state):
        parameters = self.named_parameters()
        if parameters.keys() != state.keys():
            raise ValueError("state keys must exactly match parameters")
        values = {key: np.array(value, dtype=float, copy=True) for key, value in state.items()}
        if any(values[key].shape != p.shape for key, p in parameters.items()):
            raise ValueError("state shape mismatch")
        for key, p in parameters.items():
            p.data[...] = values[key]

    # @id CODE-LAYERS-006 @implements REQ-LAYERS-006
    def train(self, mode=True):
        visited, stack = set(), [self]
        while stack:
            module = stack.pop()
            if id(module) in visited:
                continue
            visited.add(id(module))
            module.training = bool(mode)
            stack.extend(module.children())
        return self


class Linear(Module):
    def __init__(self, in_features, out_features, seed=0):
        super().__init__()
        if in_features <= 0 or out_features <= 0:
            raise ValueError("feature counts must be positive")
        rng = np.random.default_rng(seed)
        self.weight = Tensor(rng.normal(0, 1 / np.sqrt(in_features), (in_features, out_features)), True)
        self.bias = Tensor(np.zeros(out_features), True)

    # @id CODE-LAYERS-001 @implements REQ-LAYERS-001 REQ-LAYERS-008
    def forward(self, x):
        return x @ self.weight + self.bias


class Sequential(Module):
    def __init__(self, *layers):
        super().__init__()
        if not all(isinstance(layer, Module) for layer in layers):
            raise TypeError("Sequential children must be modules")
        self.layers = list(layers)

    # @id CODE-LAYERS-003 @implements REQ-LAYERS-003
    def forward(self, x):
        for layer in self.layers:
            x = layer(x)
        return x


class ReLU(Module):
    def forward(self, x):
        return x.relu()


# @id CODE-LAYERS-004 @implements REQ-LAYERS-004
def mse(prediction, target):
    return ((prediction - target)**2).mean()
