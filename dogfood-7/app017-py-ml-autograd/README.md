# micrograd7

A CPU float64 tensor library with reverse-mode, first-order autodifferentiation,
NumPy broadcasting, SGD/momentum/decay, Adam checkpoints, composable layers,
and a finite-difference gradient oracle. Requires Python 3.10+, NumPy and pytest.

```python
from micrograd7.tensor import Tensor
from micrograd7.nn import Linear, mse
from micrograd7.optim import Adam

x = Tensor([[1., 2.], [2., 1.]])
target = Tensor([[3.], [3.]])
model = Linear(2, 1)
optimizer = Adam(model.parameters(), lr=0.05)
for _ in range(100):
    optimizer.zero_grad()
    loss = mse(model(x), target)
    loss.backward()
    optimizer.step()
```

`backward()` accepts scalar outputs only unless an exactly shaped seed is supplied.
Leaf gradients accumulate across calls; intermediate gradients are local to a call.
Call `zero_grad()` before each independent training step. Parameters must not be
mutated between forward and backward; higher derivatives are unsupported.
`@` currently accepts two-dimensional matrices. `detach()` and exported state copy
storage; both optimizers restore copy-isolated checkpoints, and module state loading
validates all shapes before mutating scalar or vector parameters.
Finite differences evaluate deterministic scalar functions without changing inputs
and reject nonfinite outputs and gradients.

Run `python3 -m pytest` from this directory. SDD commands must use this directory as
both cwd and `--root`; `.sdd/plan.md` orders the five reviewed T2 features.
