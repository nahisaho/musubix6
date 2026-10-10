---
feature: drv
tier: T1
---
# drv
Goal: one-call pipeline and human-readable error rendering. Non-goals: REPL.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DRV-001 | When run(src) is called with a well-typed program, the driver shall lex, parse, check and evaluate it and return the Value. | TEST-DRV-001 |
| REQ-DRV-002 | If any stage fails, then run shall return the stage error and shall not evaluate when type checking fails. | TEST-DRV-002 |
| REQ-DRV-003 | When an error is rendered, the driver shall print "line:col: message" followed by the source line and a caret underline of the span. | TEST-DRV-003 |
| REQ-DRV-004 | When a span begins on a later line, the driver shall compute 1-based line and column from byte offsets. | TEST-DRV-004 |
