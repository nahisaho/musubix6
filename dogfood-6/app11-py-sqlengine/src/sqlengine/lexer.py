import re
from dataclasses import dataclass

from .errors import SqlError

KEYWORDS = frozenset("""
SELECT FROM WHERE GROUP BY HAVING ORDER ASC DESC LIMIT OFFSET DISTINCT AS
JOIN INNER LEFT OUTER CROSS ON AND OR NOT IS NULL IN BETWEEN LIKE TRUE FALSE
CREATE TABLE INSERT INTO VALUES
""".split())

_TWO_CHAR_OPS = ("<>", "!=", "<=", ">=", "||")
_ONE_CHAR_OPS = "=<>+-*/%"
_PUNCT = ",().;"
_NUMBER = re.compile(r"(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?")
_WORD = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


class LexError(SqlError):
    def __init__(self, message, pos):
        super().__init__(f"{message} at offset {pos}")
        self.pos = pos


@dataclass(frozen=True)
class Token:
    kind: str
    value: object
    pos: int


def _quoted(sql, i, quote, what):
    j = i + 1
    out = []
    while True:
        k = sql.find(quote, j)
        if k < 0:
            raise LexError(f"unterminated {what}", i)
        out.append(sql[j:k])
        if sql.startswith(quote, k + 1):
            out.append(quote)
            j = k + 2
            continue
        return "".join(out), k + 1


# @id CODE-LEX-001 @implements REQ-LEX-001
# @implements REQ-LEX-002
# @implements REQ-LEX-003
# @implements REQ-LEX-004
# @implements REQ-LEX-005
# @implements REQ-LEX-006
# @implements REQ-LEX-007
# @implements REQ-LEX-008
# @implements REQ-LEX-009
def tokenize(sql):
    toks = []
    i, n = 0, len(sql)
    while i < n:
        c = sql[i]
        if c.isspace():
            i += 1
        elif sql.startswith("--", i):
            j = sql.find("\n", i)
            i = n if j < 0 else j + 1
        elif sql.startswith("/*", i):
            j = sql.find("*/", i + 2)
            if j < 0:
                raise LexError("unterminated block comment", i)
            i = j + 2
        elif c == "'":
            value, j = _quoted(sql, i, "'", "string")
            toks.append(Token("STRING", value, i))
            i = j
        elif c == '"':
            value, j = _quoted(sql, i, '"', "quoted identifier")
            toks.append(Token("IDENT", value, i))
            i = j
        elif c.isdigit() or (c == "." and i + 1 < n and sql[i + 1].isdigit()):
            m = _NUMBER.match(sql, i)
            text = m.group(0)
            is_float = "." in text or m.group(2) is not None
            toks.append(Token("NUMBER", float(text) if is_float else int(text), i))
            i = m.end()
        elif c.isalpha() or c == "_":
            m = _WORD.match(sql, i)
            word = m.group(0)
            up = word.upper()
            toks.append(Token("KEYWORD", up, i) if up in KEYWORDS else Token("IDENT", word, i))
            i = m.end()
        elif sql[i:i + 2] in _TWO_CHAR_OPS:
            op = sql[i:i + 2]
            toks.append(Token("OP", "<>" if op == "!=" else op, i))
            i += 2
        elif c in _ONE_CHAR_OPS:
            toks.append(Token("OP", c, i))
            i += 1
        elif c in _PUNCT:
            toks.append(Token("PUNCT", c, i))
            i += 1
        else:
            raise LexError(f"unexpected character {c!r}", i)
    toks.append(Token("EOF", None, n))
    return toks
