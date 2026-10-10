---
feature: ops
tier: T2
approval: auto
---
# ops
Goal: text operations (retain n / insert s / delete n) with apply, normalize, compose, transform and invert.  Non-goals: rich text attributes, unicode grapheme handling (UTF-16 units only).

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-OPS-001 | The system shall define baseLength(op) as retained+deleted units and targetLength(op) as retained+inserted units. | TEST-OPS-001 |
| REQ-OPS-002 | If a component is a non-positive or non-integer number, an empty string or an unknown shape, then validate(op) shall throw OpError. | TEST-OPS-002 |
| REQ-OPS-003 | When normalize(op) is called, the system shall merge adjacent same-kind components, drop zero-length ones and order an insert before an adjacent delete. | TEST-OPS-003 |
| REQ-OPS-004 | When apply(doc, op) is called with baseLength(op) == doc.length, the system shall return the edited text. | TEST-OPS-004 |
| REQ-OPS-005 | If baseLength(op) != doc.length, then apply shall throw OpError and not return a partial result. | TEST-OPS-005 |
| REQ-OPS-006 | When compose(a, b) is called, the system shall return c with apply(apply(d,a),b) == apply(d,c) for every valid d. | TEST-OPS-006 |
| REQ-OPS-007 | If targetLength(a) != baseLength(b), then compose shall throw OpError. | TEST-OPS-007 |
| REQ-OPS-008 | When transform(a, b) is called on ops with equal baseLength, the system shall return [a2, b2] with apply(apply(d,a),b2) == apply(apply(d,b),a2). | TEST-OPS-008 |
| REQ-OPS-009 | While both ops insert at the same position, transform(a, b) shall place a's insert before b's insert in both results. | TEST-OPS-009 |
| REQ-OPS-010 | If baseLength(a) != baseLength(b), then transform shall throw OpError. | TEST-OPS-010 |
| REQ-OPS-011 | When invert(op, doc) is called, the system shall return an op with apply(apply(doc,op), inv) == doc. | TEST-OPS-011 |
| REQ-OPS-012 | When isNoop(op) is called, the system shall return true only when the normalized op contains neither an insert nor a delete. | TEST-OPS-012 |

## Design
Component = number (retain) | string (insert) | {d:n} (delete). Ops are full-length (trailing retain kept) so baseLength is always defined.
| Function | Precondition | Invariant |
| --- | --- | --- |
| apply | baseLength==len(doc) | result length == targetLength |
| compose | target(a)==base(b) | base(c)==base(a), target(c)==target(b) |
| transform | base(a)==base(b) | target(a2)==target(b2) (TP1 convergence) |
| invert | base(op)==len(doc) | base(inv)==target(op) |
Tie rule: simultaneous inserts at one position: the first argument wins (goes left). Delete vs delete over the same range deletes once.
## Assumptions / risks
Overlapping delete/delete and insert-inside-delete cases are retired by the exhaustive small-doc convergence test (TEST-OPS-008).
