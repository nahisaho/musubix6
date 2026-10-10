---
feature: nn
tier: T1
---
# nn
Goal: Linear/MLP layers, losses and SGD built on ops. Depends on ops, tape, tensor, rng.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-NN-001 | When Linear(nin, nout, rng) is created, the system shall initialise W (nin x nout) uniformly in +-sqrt(6/(nin+nout)) (Xavier) and b as zeros(1,nout). | TEST-NN-001 |
| REQ-NN-002 | When mlp_forward(m, vars, x) is called with x of shape batch x nin, the system shall return batch x nout, applying the activation between layers but not after the last. | TEST-NN-002 |
| REQ-NN-003 | When MLP(sizes, rng) is created with fewer than 2 sizes or a non-positive size, the system shall throw ArgumentError; otherwise parameters(m) lists W1,b1,W2,b2,... in order. | TEST-NN-003 |
| REQ-NN-004 | When bind!(m, tape) is called, the system shall return one requires_grad leaf Var per parameter in parameters(m) order sharing no storage with the model. | TEST-NN-004 |
| REQ-NN-005 | When mse_loss(pred, target) is applied, the system shall return mean((pred-target)^2) as a scalar Var with gradient 2(pred-target)/n. | TEST-NN-005 |
| REQ-NN-006 | When softmax_ce(logits, labels) is applied, the system shall return the mean cross-entropy using the log-sum-exp trick; labels are 1-based class indices, out-of-range label throws BoundsError. | TEST-NN-006 |
| REQ-NN-007 | When sgd_step!(opt, params, vars) is called, the system shall update params in place with velocity v = momentum*v + (grad + wd*p), p -= lr*v. | TEST-NN-007 |
| REQ-NN-008 | If lr <= 0 or momentum outside [0,1), then SGD shall throw ArgumentError. | TEST-NN-008 |
| REQ-NN-009 | When clip_grad_norm!(vars, maxnorm) is called, the system shall scale all grads by maxnorm/norm iff the global L2 norm exceeds maxnorm and return the pre-clip norm. | TEST-NN-009 |
| REQ-NN-010 | The system shall pass gradcheck on a 2-layer MLP with tanh and with mse_loss for W1,b1,W2,b2. | TEST-NN-010 |
| REQ-NN-011 | When softmax_ce receives logits with magnitude >= 1000, the system shall return a finite loss and finite gradients (stable log-sum-exp by per-row max subtraction) identical to the loss of the max-shifted logits. | TEST-NN-011 |
