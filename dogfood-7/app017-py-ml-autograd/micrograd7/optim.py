"""Gradient optimizers with isolated, validated checkpoint state."""
import copy
import math
import numpy as np


class Optimizer:
    def __init__(self, parameters, lr):
        if not math.isfinite(lr) or lr < 0:
            raise ValueError("learning rate must be finite and nonnegative")
        self.parameters = list(dict.fromkeys(parameters))
        self.lr = lr

    # @id CODE-OPTIM-005 @implements REQ-OPTIM-005
    def zero_grad(self):
        for p in self.parameters:
            p.grad = None

    def _validate_gradients(self):
        for p in self.parameters:
            if p.grad is not None and (p.grad.shape != p.shape or not np.isfinite(p.grad).all()):
                raise ValueError("invalid parameter gradient")


class SGD(Optimizer):
    def __init__(self, parameters, lr=0.01, momentum=0., weight_decay=0.):
        super().__init__(parameters, lr)
        if not 0 <= momentum < 1 or not math.isfinite(weight_decay) or weight_decay < 0:
            raise ValueError("invalid momentum or weight decay")
        self.momentum, self.weight_decay = momentum, weight_decay
        self.velocity = [np.zeros_like(p.data) for p in self.parameters]

    # @id CODE-OPTIM-001 @implements REQ-OPTIM-001 REQ-OPTIM-002 REQ-OPTIM-003 REQ-OPTIM-006
    def step(self):
        self._validate_gradients()
        for i, p in enumerate(self.parameters):
            if p.grad is None:
                continue
            self.velocity[i] = self.momentum * self.velocity[i] + p.grad + self.weight_decay * p.data
            p.data -= self.lr * self.velocity[i]

    def state_dict(self):
        return copy.deepcopy(dict(lr=self.lr, momentum=self.momentum,
                                  weight_decay=self.weight_decay, velocity=self.velocity))

    # @id CODE-OPTIM-009 @implements REQ-OPTIM-009
    def load_state_dict(self, state):
        state = copy.deepcopy(state)
        validated = SGD(self.parameters, state["lr"], state["momentum"], state["weight_decay"])
        velocity = [np.array(v, dtype=float, copy=True) for v in state["velocity"]]
        if len(velocity) != len(self.parameters) or any(
            v.shape != p.shape or not np.isfinite(v).all()
            for v, p in zip(velocity, self.parameters)
        ):
            raise ValueError("invalid SGD velocity")
        self.lr, self.momentum = validated.lr, validated.momentum
        self.weight_decay, self.velocity = validated.weight_decay, velocity


class Adam(Optimizer):
    # @id CODE-OPTIM-007 @implements REQ-OPTIM-007
    def __init__(self, parameters, lr=0.001, betas=(0.9, 0.999), eps=1e-8):
        super().__init__(parameters, lr)
        if len(betas) != 2 or not all(0 <= b < 1 for b in betas):
            raise ValueError("betas must be in [0,1)")
        if not math.isfinite(eps) or eps <= 0:
            raise ValueError("epsilon must be finite and positive")
        self.betas, self.eps = tuple(betas), eps
        self.m = [np.zeros_like(p.data) for p in self.parameters]
        self.v = [np.zeros_like(p.data) for p in self.parameters]
        self.t = [0 for p in self.parameters]

    # @id CODE-OPTIM-004 @implements REQ-OPTIM-004
    def step(self):
        self._validate_gradients()
        b1, b2 = self.betas
        for i, p in enumerate(self.parameters):
            if p.grad is None:
                continue
            self.t[i] += 1
            self.m[i] = b1 * self.m[i] + (1 - b1) * p.grad
            self.v[i] = b2 * self.v[i] + (1 - b2) * p.grad**2
            m = self.m[i] / (1 - b1**self.t[i])
            v = self.v[i] / (1 - b2**self.t[i])
            p.data -= self.lr * m / (np.sqrt(v) + self.eps)

    # @id CODE-OPTIM-008 @implements REQ-OPTIM-008
    def state_dict(self):
        return copy.deepcopy(dict(lr=self.lr, betas=self.betas, eps=self.eps,
                                  m=self.m, v=self.v, t=self.t))

    def load_state_dict(self, state):
        state = copy.deepcopy(state)
        validated = Adam(self.parameters, state["lr"], state["betas"], state["eps"])
        n = len(self.parameters)
        if any(len(state[k]) != n for k in ("m", "v", "t")):
            raise ValueError("state parameter count mismatch")
        for i, p in enumerate(self.parameters):
            if any(np.asarray(state[k][i]).shape != p.shape for k in ("m", "v")):
                raise ValueError("state shape mismatch")
            if not isinstance(state["t"][i], int) or state["t"][i] < 0:
                raise ValueError("invalid step count")
            if not all(np.isfinite(state[k][i]).all() for k in ("m", "v")) or (state["v"][i] < 0).any():
                raise ValueError("invalid optimizer moments")
        self.lr, self.betas, self.eps = validated.lr, validated.betas, validated.eps
        self.m, self.v, self.t = state["m"], state["v"], state["t"]
