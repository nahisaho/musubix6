import numpy as np

a = np.ones((2, 1))
b = np.arange(3.)
assert (a * b).shape == (2, 3)
assert np.array_equal(np.broadcast_to(b, (2, 3)).sum(axis=1, keepdims=True), [[3.], [3.]])
x, eps = 0.4, 1e-6
assert abs(((x + eps)**3 - (x - eps)**3)/(2*eps) - 3*x*x) < 1e-8
assert np.ones((2, 3)).mean(axis=(-1, 0)) == 1
print("spike: broadcast reduction, finite difference, negative axes verified")
