---
feature: lang
tier: T1
---
# lang
Goal: concrete syntax + AST (with spans) of a small expression language built on the combinator and Pratt features. Non-goals: modules, type checking.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-LNG-001 | When a number literal `12` or `3.25` is parsed, the system shall produce Num; a trailing dot (`1.`) shall not be part of the number. | TEST-LNG-001 |
| REQ-LNG-002 | When a string literal is parsed, the system shall decode `\n \t \" \\` escapes; an unterminated string shall fail at the opening quote with message "unterminated string". | TEST-LNG-002 |
| REQ-LNG-003 | While an identifier equals a reserved word (let rec in fn if then else true false), the system shall not accept it as a variable; identifiers that merely start with a keyword (`letter`, `iffy`) shall parse as variables. | TEST-LNG-003 |
| REQ-LNG-004 | When whitespace or `#` line comments appear between tokens, the system shall skip them (also leading/trailing, and a comment at end of input without newline). | TEST-LNG-004 |
| REQ-LNG-005 | When `fn(a, b) => body` or `f(x)(y)` / `f()` is parsed, the system shall produce Lambda / left-nested Call nodes. | TEST-LNG-005 |
| REQ-LNG-006 | When `let [rec] x = v in body` is parsed, the system shall produce Let with the Rec flag; a missing `in` shall fail expecting "in". | TEST-LNG-006 |
| REQ-LNG-007 | When operators are mixed, the system shall apply precedence `||` < `&&` < `== !=` < `< <= > >=` < `+ -` < `* / %` < unary `- !`; comparison levels are non-associative. | TEST-LNG-007 |
| REQ-LNG-008 | The system shall give every node a Span covering exactly its source text without surrounding whitespace; a parenthesised expression is a Group node whose Span includes the parentheses while its Inner node excludes them. | TEST-LNG-008 |
| REQ-LNG-009 | When `if c then a else b` is parsed, the system shall produce If; a missing `else` shall fail expecting "else". | TEST-LNG-009 |
| REQ-LNG-010 | When a parse fails, the system shall never list whitespace or comment characters in the Expected set (bug fix: Ws leaked "whitespace" and '#'). | TEST-LNG-010 |

## Assumptions / risks: `Num` uses double; `1e3` exponent notation is out of scope (non-goal).
