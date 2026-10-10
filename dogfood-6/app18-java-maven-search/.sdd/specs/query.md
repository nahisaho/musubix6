---
feature: query
tier: T2
---
# query
Goal: lexer + recursive-descent parser producing an analyzed boolean/phrase query tree, plus simplifier.
Non-goals: wildcards, fuzzy, field queries.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-QUERY-001 | When lexing, the system shall emit WORD, PHRASE, LPAREN, RPAREN, AND, OR, NOT with start offsets; only upper-case AND/OR/NOT are keywords. | TEST-QUERY-001 |
| REQ-QUERY-002 | When parsing, the system shall give NOT higher precedence than AND and AND higher than OR. | TEST-QUERY-002 |
| REQ-QUERY-003 | When two operands are adjacent without operator, the system shall treat them as AND. | TEST-QUERY-003 |
| REQ-QUERY-004 | When parentheses are used, the system shall let them override precedence. | TEST-QUERY-004 |
| REQ-QUERY-005 | When a quoted phrase is parsed, the system shall produce a Phrase of analyzed tokens whose relative positions keep stopword gaps. | TEST-QUERY-005 |
| REQ-QUERY-006 | If parentheses are unbalanced, then the system shall throw QuerySyntaxException at the offset of the offending paren. | TEST-QUERY-006 |
| REQ-QUERY-007 | If a quote is not closed, then the system shall throw QuerySyntaxException at the offset of the opening quote. | TEST-QUERY-007 |
| REQ-QUERY-008 | If the query is empty, only stopwords, or has a dangling or leading binary operator, then the system shall throw QuerySyntaxException. | TEST-QUERY-008 |
| REQ-QUERY-009 | When simplifying, the system shall fold NOT NOT x into x, flatten nested AND/OR and unwrap single-child AND/OR. | TEST-QUERY-009 |
| REQ-QUERY-010 | When a word is analyzed, the system shall stem it and turn a word yielding several tokens into a Phrase. | TEST-QUERY-010 |
| REQ-QUERY-011 | When an operand analyzes to nothing (stopword), the system shall drop it from AND/OR and drop a NOT whose operand vanished. | TEST-QUERY-011 |

## Design
Grammar: expr := and (OR and)* ; and := unary (AND? unary)* ; unary := NOT unary | primary ; primary := LPAREN expr RPAREN | PHRASE | WORD.

| Parser state | Token | Next | Note |
| --- | --- | --- | --- |
| expect operand | WORD/PHRASE | after operand | build leaf |
| expect operand | NOT | expect operand | wrap Not |
| expect operand | LPAREN | expect operand (depth+1) | recursive |
| expect operand | AND/OR/RPAREN/end | ERROR | missing operand |
| after operand | AND/OR | expect operand | binary |
| after operand | WORD/PHRASE/NOT/LPAREN | expect operand | implicit AND |
| after operand | RPAREN, depth>0 | after operand (depth-1) | close |
| after operand | RPAREN, depth==0 | ERROR | stray paren at its offset |
| after operand | end, depth>0 | ERROR | unclosed paren at its offset |

| Id | Invariant |
| --- | --- |
| I1 | every QuerySyntaxException carries the offset of the offending char |
| I2 | parse output contains no empty And/Or |
| I3 | Phrase token positions are normalized so the first is 0 |

## Assumptions / risks
- Lowercase and/or/not are plain words (TEST-QUERY-001).
