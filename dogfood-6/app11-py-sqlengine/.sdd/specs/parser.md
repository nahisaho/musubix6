---
feature: parser
tier: T2
approval: auto
---
# parser
Goal: recursive-descent parser from tokens to an immutable AST (SELECT, CREATE TABLE, INSERT). Non-goals: subqueries, UNION, CASE, window functions, DML other than INSERT.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PAR-001 | When parsing a select list, the parser shall accept expressions with optional `[AS] alias`, `*` and `t.*`. | TEST-PAR-001 |
| REQ-PAR-002 | When a FROM clause is parsed, the parser shall accept an optional `name [[AS] alias]` (no FROM means a single empty row source) followed by any number of `[INNER] JOIN .. ON`, `LEFT [OUTER] JOIN .. ON`, `CROSS JOIN`, and comma (= cross join). | TEST-PAR-002 |
| REQ-PAR-003 | The parser shall bind operators by precedence OR < AND < NOT < comparison/IS/IN/BETWEEN/LIKE < `+ - \|\|` < `* / %` < unary minus. | TEST-PAR-003 |
| REQ-PAR-004 | The parser shall treat binary operators of equal precedence as left-associative and honour parentheses. | TEST-PAR-004 |
| REQ-PAR-005 | When `IS [NOT] NULL`, `[NOT] IN (list)`, `[NOT] BETWEEN a AND b` or `[NOT] LIKE p` appears, the parser shall build the matching node; the AND of BETWEEN shall not be taken as a boolean AND. | TEST-PAR-005 |
| REQ-PAR-006 | When a function call appears, the parser shall build Func with args; `COUNT(*)` sets star and `f(DISTINCT x)` sets distinct. | TEST-PAR-006 |
| REQ-PAR-007 | The parser shall accept SELECT DISTINCT, WHERE, GROUP BY, HAVING, ORDER BY (ASC default, DESC), LIMIT n and OFFSET m in that order. | TEST-PAR-007 |
| REQ-PAR-008 | If the input is malformed or has trailing tokens after an optional `;`, then the parser shall raise ParseError carrying the offending token offset. | TEST-PAR-008 |
| REQ-PAR-009 | When `CREATE TABLE t (col TYPE [NOT NULL], ..)` is parsed, the parser shall build CreateTable with column definitions. | TEST-PAR-009 |
| REQ-PAR-010 | When `INSERT INTO t VALUES (..),(..)` is parsed, the parser shall build Insert with literal expression rows (including negative numbers and NULL/TRUE/FALSE). | TEST-PAR-010 |

## Design
Components: `ast.py` (frozen dataclasses: Literal, Column, Unary, Binary, IsNull, InList, Between, Like, Func, Star, SelectItem, TableRef, Join, Select, CreateTable, ColumnDef, Insert), `parser.py` (class Parser over `tokenize` output, one method per precedence level).

Precedence table (loosest first; each level = one method, calls the next tighter):

| level | method | operators | assoc |
| --- | --- | --- | --- |
| 1 | or_expr | OR | left |
| 2 | and_expr | AND | left |
| 3 | not_expr | NOT (prefix) | right |
| 4 | predicate | = <> < <= > >= , IS [NOT] NULL, [NOT] IN/BETWEEN/LIKE | left |
| 5 | additive | + - \|\| | left |
| 6 | multiplicative | * / % | left |
| 7 | unary | - (prefix) | right |
| 8 | primary | literal, column, func, ( expr ) | - |

State/invariants: parser position `i` only advances; EOF token is never consumed; BETWEEN's lower/upper bounds parse at `additive` level so the connecting AND is not swallowed; AST nodes are immutable and hashable (tuples for lists); every ParseError carries the offset of the token where parsing failed.

## Assumptions / risks
Keyword-named columns need quoting (lexer). `a < b < c` parses left-nested (comparisons chain left); retired by TEST-PAR-004.
