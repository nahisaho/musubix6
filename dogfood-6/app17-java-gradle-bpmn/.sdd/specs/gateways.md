---
feature: gateways
tier: T2
---
# gateways
Goal: condition expressions and exclusive/parallel gateway routing in the engine. Non-goals: inclusive (OR) gateways, event-based gateways.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-GATEWAYS-001 | When Expr.parse(text).eval(vars) is called, the expression shall support number, "string" and true/false literals, variable names and the operators == != < <= > >=. | TEST-GATEWAYS-001 |
| REQ-GATEWAYS-002 | The expression grammar shall bind `!` tighter than comparison, comparison tighter than `&&`, `&&` tighter than `\|\|`, and honour parentheses. | TEST-GATEWAYS-002 |
| REQ-GATEWAYS-003 | When the left operand of `&&` is false or of `\|\|` is true, the evaluator shall not evaluate the right operand. | TEST-GATEWAYS-003 |
| REQ-GATEWAYS-004 | If an expression has a syntax error, an undefined variable, or mixes types, then it shall throw ExprException with code SYNTAX (with position), UNDEFINED or TYPE respectively. | TEST-GATEWAYS-004 |
| REQ-GATEWAYS-005 | The evaluator shall compare Integer, Long and Double variables and literals numerically (1 == 1.0). | TEST-GATEWAYS-005 |
| REQ-GATEWAYS-006 | When an exclusive gateway has several outgoing flows, the engine shall follow the first non-default flow, in declaration order, whose condition is true. | TEST-GATEWAYS-006 |
| REQ-GATEWAYS-007 | If no condition is true, then the engine shall follow the default flow; if there is none, then it shall FAIL the instance with NO_MATCH. | TEST-GATEWAYS-007 |
| REQ-GATEWAYS-008 | If evaluating a flow condition throws ExprException, then the engine shall FAIL the instance with EXPR_ERROR plus the expression code. | TEST-GATEWAYS-008 |
| REQ-GATEWAYS-009 | When a token enters a parallel gateway with several outgoing flows, the engine shall consume it and create one new token per outgoing flow, in flow order. | TEST-GATEWAYS-009 |
| REQ-GATEWAYS-010 | When a token enters a parallel gateway with several incoming flows, the engine shall hold it BLOCKED until every incoming flow has delivered a token, then consume one token per flow and emit exactly one token. | TEST-GATEWAYS-010 |
| REQ-GATEWAYS-011 | When a join has fired, the engine shall re-arm it so that a loop passing the same join again waits for a full new set of arrivals. | TEST-GATEWAYS-011 |
| REQ-GATEWAYS-012 | If no token is ACTIVE or WAITING and at least one token is BLOCKED at a join, then the engine shall FAIL the instance with DEADLOCK naming the blocked join ids. | TEST-GATEWAYS-012 |
| REQ-GATEWAYS-013 | When a token enters an exclusive gateway with several incoming flows and one outgoing flow, the engine shall pass each token through individually without waiting. | TEST-GATEWAYS-013 |
| REQ-GATEWAYS-014 | While one parallel branch waits for Engine.complete, the join shall stay blocked, and the instance shall complete only after the branch has been completed. | TEST-GATEWAYS-014 |
| REQ-GATEWAYS-015 | If a numeric literal is malformed (for example `1.2.3` or `1.`), then Expr.parse shall throw ExprException SYNTAX at the literal position, and an engine evaluating such a flow condition shall FAIL the instance with EXPR_ERROR rather than let an unchecked exception escape. | TEST-GATEWAYS-015 |

## Design
Components: `Expr` (tokenizer + recursive-descent parser producing an AST; `eval(Map)`), `ExprException(code,pos)`, engine routing in `Engine.move` (split dispatch by node type) and join bookkeeping in `Instance` (arrivals per join node and incoming flow index).
Grammar: or := and ('||' and)* ; and := not ('&&' not)* ; not := '!' not | cmp ; cmp := term (op term)? ; term := number | string | true | false | ident | '(' or ')'.

| Node type | In flows | Out flows | Behaviour |
| --- | --- | --- | --- |
| XOR | any | 1 | pass through |
| XOR | any | >1 | first true condition, else default, else NO_MATCH |
| AND | 1 | >1 | fork: consume + one token per flow |
| AND | >1 | 1 | join: BLOCKED until all incoming flows arrived, then one token |
| AND | 1 | 1 | pass through |

| Token state | Event | Next |
| --- | --- | --- |
| ACTIVE | arrives at join, set incomplete | BLOCKED |
| BLOCKED | join fires | CONSUMED (new ACTIVE token emitted) |
| BLOCKED | terminate / fail | CONSUMED |

Invariants: a join emits exactly one token per full arrival set; arrival counts never negative; BLOCKED tokens count as live; DEADLOCK only when nothing can still progress (no ACTIVE/WAITING).
Value types: Double (all numbers), String, Boolean; mixing types in a comparison is TYPE; `<` etc. on booleans is TYPE.

## Assumptions / risks
Flow identity inside `Instance` is by index into `model.flows()`; parallel duplicate flows between the same nodes are distinct indices (retired by TEST-GATEWAYS-010).
