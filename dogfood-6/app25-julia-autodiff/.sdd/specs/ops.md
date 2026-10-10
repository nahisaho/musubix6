---
feature: ops
tier: T2
---
# ops
Goal: differentiable tensor operations recorded on the tape. Depends on tensor, tape.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-OPS-001 | When add_v/sub_v/mul_v are applied to Vars, the system shall return a Var with the forward value and record backward closures producing d/da and d/db. | TEST-OPS-001 |
| REQ-OPS-002 | While operands have equal, scalar (0-D) or other broadcast-compatible shapes, the system shall reduce each parent gradient to the parent's shape with sum_to_shape. | TEST-OPS-002 |
| REQ-OPS-003 | When matmul_v(a,b) is applied, the system shall backpropagate dA = G*B' and dB = A'*G. | TEST-OPS-003 |
| REQ-OPS-004 | When relu_v is applied, the system shall pass gradient 1 where x > 0 and 0 where x <= 0 (including x == 0). | TEST-OPS-004 |
| REQ-OPS-005 | When tanh_v / sigmoid_v / exp_v are applied, the system shall backpropagate 1-y^2, y(1-y), y respectively using the forward output; sigmoid_v shall stay finite and in [0,1] for |x| up to 1000. | TEST-OPS-005 |
| REQ-OPS-006 | When log_v is applied, the system shall backpropagate 1/x; if any x <= 0 it shall throw DomainError. | TEST-OPS-006 |
| REQ-OPS-007 | When sum_v(x; dims, keepdims) / mean_v(x; dims, keepdims) are applied (output shape exactly as sum_t; invalid dims throw ArgumentError), the system shall backpropagate G reshaped to the keepdims form and broadcast to size(x) (scaled by 1/n for mean, n=reduced count). | TEST-OPS-007 |
| REQ-OPS-008 | When pow_v(x, p::Integer) is applied, the system shall backpropagate p*x^(p-1) and pow_v(x,0) shall have zero gradient. | TEST-OPS-008 |
| REQ-OPS-009 | When mul_v(x,x) uses the same Var for both operands, the system shall deliver gradient 2x (fan-out accumulation through the tape). | TEST-OPS-009 |
| REQ-OPS-010 | While no parent requires grad or inside no_grad, the system shall return Vars with requires_grad=false and record no backward closure; detached (tape-less) Vars and plain Real operands act as constants, while a Var of a stale epoch or another tape shall throw ArgumentError. | TEST-OPS-010 |
| REQ-OPS-011 | When Julia operators +,-,*,/ (Var,Var) and (Var,Real) and unary - are used, the system shall dispatch to the differentiable ops; * on two matrices means matmul_v. | TEST-OPS-011 |
| REQ-OPS-012 | When div_v(a,b) is applied, the system shall backpropagate 1/b and -a/b^2 and throw DomainError if any b == 0. | TEST-OPS-012 |

## Design
Components: one file Ops.jl; every op builds its forward Tensor with tensor.jl functions, then calls Tape.record!(tape, out, parents, backfn).
| op | forward | backfn(G) per parent | notes |
| --- | --- | --- | --- |
| add | a+b | (G, G) reduced | reduce via sum_to_shape |
| sub | a-b | (G, -G) reduced | |
| mul | a*b | (G*b, G*a) reduced | same-Var fan-out |
| matmul | A*B | (G*B', A'*G) | 2-D only |
| relu | max(x,0) | G .* (x>0) | subgradient 0 at 0 |
| tanh | tanh x | G .* (1-y^2) | from output y |
| exp | exp x | G .* y | |
| sum/mean | sum_t(x;dims,keepdims) | G reshaped (keepdims) then broadcast to size(x) (/n for mean) | 0-D output ok |
| pow(p::Integer) | x^p | G .* p x^(p-1) | p=0 => zeros |
| div | a/b | (G/b, -G a/b^2) reduced | DomainError b==0 |
| sigmoid | stable branch on sign | G .* y(1-y) | no exp overflow |
| log | log x | G ./ x | DomainError x<=0 |
Invariant: every parent gradient returned has size == size(parent.value) (checked by tape, REQ-TAPE-012).
## Assumptions / risks: broadcasting gradients are the classic bug source; retired by TEST-OPS-002 and gradcheck (feature gradcheck).
