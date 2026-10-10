---
feature: gradcheck
tier: T1
---
# gradcheck
Goal: numerical gradient verification of tape gradients. Depends on tape, ops, tensor.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-GRADCHECK-001 | When numeric_grad(f, t; eps) is called, the system shall return the central difference (f(x+e)-f(x-e))/(2e) per element, restoring t to its original values and never mutating the caller's tensor. | TEST-GRADCHECK-001 |
| REQ-GRADCHECK-002 | If eps <= 0, then numeric_grad and gradcheck shall throw ArgumentError. | TEST-GRADCHECK-002 |
| REQ-GRADCHECK-003 | When gradcheck(f, inputs) is called with f mapping Vars to a scalar Var, the system shall compare analytic and numeric grads and return a GradCheckResult with ok, max_abs_err, max_rel_err, worst (input index, element). | TEST-GRADCHECK-003 |
| REQ-GRADCHECK-004 | The system shall report ok iff every element satisfies |a-n| <= atol + rtol*|n| (defaults atol=1e-6, rtol=1e-4). | TEST-GRADCHECK-004 |
| REQ-GRADCHECK-005 | When an analytic gradient is deliberately wrong (custom op with a bad backfn), the system shall report ok=false and identify the worst element. | TEST-GRADCHECK-005 |
| REQ-GRADCHECK-006 | If f does not return a scalar Var, then gradcheck shall throw ArgumentError. | TEST-GRADCHECK-006 |
| REQ-GRADCHECK-007 | When an input does not influence the output, the system shall treat its analytic grad as zeros and list its index in unused. | TEST-GRADCHECK-007 |
| REQ-GRADCHECK-008 | When format_result(res) is called, the system shall return a one-line summary starting with "PASS" or "FAIL" containing max_abs_err and the worst location. | TEST-GRADCHECK-008 |
