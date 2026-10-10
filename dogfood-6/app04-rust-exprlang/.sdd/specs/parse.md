---
feature: parse
tier: T1
---
# parse
Goal: Pratt parser from tokens to a spanned AST. Non-goals: recovery after the first error.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PARSE-001 | When parsing a mix of operators, the parser shall honour precedence (* / % over + - over < <= > >= over == != over && over \|\|). | TEST-PARSE-001 |
| REQ-PARSE-002 | When parsing binary operators of equal precedence, the parser shall associate them to the left. | TEST-PARSE-002 |
| REQ-PARSE-003 | When a unary - or ! precedes an operand, the parser shall bind it tighter than any binary operator. | TEST-PARSE-003 |
| REQ-PARSE-004 | When parentheses group an expression, the parser shall return the inner tree with a span covering the parentheses. | TEST-PARSE-004 |
| REQ-PARSE-005 | When parsing let, if and fn expressions, the parser shall build Let, If and Lambda nodes whose body extends as far right as possible. | TEST-PARSE-005 |
| REQ-PARSE-006 | When a call suffix follows an expression, the parser shall build left-nested Call nodes binding tighter than unary operators. | TEST-PARSE-006 |
| REQ-PARSE-007 | When a binary node is built, the parser shall set its span from the start of the left operand to the end of the right operand. | TEST-PARSE-007 |
| REQ-PARSE-008 | If an unexpected token or Eof occurs, then the parser shall return a ParseError whose span is that token; lex errors propagate with their span. | TEST-PARSE-008 |
| REQ-PARSE-009 | When a parameter has a type annotation, the parser shall parse Int, Bool and function types (A, B) -> R into Ty. | TEST-PARSE-009 |
