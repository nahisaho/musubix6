from dataclasses import dataclass

from .ast import Var, Lit, Lam, App, Let, If, Pair

KEYWORDS = {"let", "rec", "in", "if", "then", "else", "fun"}
MAX_DEPTH = 100
SYMBOLS = ["->", "==", "\\", ".", "=", "(", ")", ",", "+", "-", "*", "<"]


class ParseError(Exception):
    def __init__(self, msg, line, col):
        super().__init__(f"{line}:{col}: {msg}")
        self.msg = msg
        self.line = line
        self.col = col


@dataclass(frozen=True)
class Token:
    kind: str
    text: str
    line: int
    col: int


# @id CODE-PARSE-001 @implements REQ-PARSE-001 REQ-PARSE-007 REQ-PARSE-008
def tokenize(src):
    toks = []
    i, line, col = 0, 1, 1
    n = len(src)
    while i < n:
        c = src[i]
        if c == "\n":
            i, line, col = i + 1, line + 1, 1
        elif c in " \t\r":
            i, col = i + 1, col + 1
        elif src.startswith("--", i):
            while i < n and src[i] != "\n":
                i, col = i + 1, col + 1
        elif c.isdigit():
            j = i
            while j < n and src[j].isdigit():
                j += 1
            toks.append(Token("int", src[i:j], line, col))
            i, col = j, col + (j - i)
        elif c.isalpha() or c == "_":
            j = i
            while j < n and (src[j].isalnum() or src[j] in "_'"):
                j += 1
            word = src[i:j]
            if word in ("true", "false"):
                kind = "bool"
            elif word in KEYWORDS:
                kind = word
            else:
                kind = "ident"
            toks.append(Token(kind, word, line, col))
            i, col = j, col + (j - i)
        else:
            sym = next((s for s in SYMBOLS if src.startswith(s, i)), None)
            if sym is None:
                raise ParseError(f"unexpected character {c!r}", line, col)
            toks.append(Token(sym, sym, line, col))
            i, col = i + len(sym), col + len(sym)
    toks.append(Token("eof", "", line, col))
    return toks


class _Parser:
    def __init__(self, toks):
        self.toks = toks
        self.i = 0
        self.depth = 0

    @property
    def cur(self):
        return self.toks[self.i]

    def error(self, what=None):
        t = self.cur
        what = what or (
            "unexpected end of input" if t.kind == "eof" else f"unexpected {t.text!r}"
        )
        raise ParseError(what, t.line, t.col)

    def eat(self, kind):
        if self.cur.kind != kind:
            self.error(f"expected {kind!r}, found " + (
                "end of input" if self.cur.kind == "eof" else repr(self.cur.text)))
        t = self.cur
        self.i += 1
        return t

    # @id CODE-PARSE-002 @implements REQ-PARSE-002 REQ-PARSE-005 REQ-PARSE-010 REQ-PARSE-011
    def expr(self):
        self.depth += 1
        if self.depth > MAX_DEPTH:
            self.error("nesting too deep")
        try:
            return self._expr()
        finally:
            self.depth -= 1

    def _expr(self):
        t = self.cur
        pos = (t.line, t.col)
        if t.kind in ("\\", "fun"):
            self.i += 1
            names = [self.eat("ident")]
            while self.cur.kind == "ident":
                names.append(self.eat("ident"))
            self.eat("." if t.kind == "\\" else "->")
            body = self.expr()
            for nm in reversed(names):
                body = Lam(nm.text, body, (nm.line, nm.col))
            return body
        if t.kind == "let":
            self.i += 1
            rec = False
            if self.cur.kind == "rec":
                self.i += 1
                rec = True
            name = self.eat("ident").text
            self.eat("=")
            value = self.expr()
            self.eat("in")
            return Let(name, value, self.expr(), rec, pos)
        if t.kind == "if":
            self.i += 1
            c = self.expr()
            self.eat("then")
            a = self.expr()
            self.eat("else")
            return If(c, a, self.expr(), pos)
        return self.cmp()

    @staticmethod
    def _bin(op, a, b):
        pos = (op.line, op.col)
        return App(App(Var(op.kind, pos), a, a.pos), b, a.pos)

    # @id CODE-PARSE-004 @implements REQ-PARSE-004
    def cmp(self):
        left = self.add()
        if self.cur.kind in ("==", "<"):
            op = self.cur
            self.i += 1
            left = self._bin(op, left, self.add())
            if self.cur.kind in ("==", "<"):
                self.error("comparison operators are not associative")
        return left

    def add(self):
        left = self.mul()
        while self.cur.kind in ("+", "-"):
            op = self.cur
            self.i += 1
            left = self._bin(op, left, self.mul())
        return left

    def mul(self):
        left = self.app()
        while self.cur.kind == "*":
            op = self.cur
            self.i += 1
            left = self._bin(op, left, self.app())
        return left

    # @id CODE-PARSE-003 @implements REQ-PARSE-003
    def app(self):
        fn = self.atom()
        while self.cur.kind in ("ident", "int", "bool", "("):
            fn = App(fn, self.atom(), fn.pos)
        return fn

    # @id CODE-PARSE-006 @implements REQ-PARSE-006 REQ-PARSE-009
    def atom(self):
        t = self.cur
        pos = (t.line, t.col)
        if t.kind == "ident":
            self.i += 1
            return Var(t.text, pos)
        if t.kind == "int":
            self.i += 1
            return Lit(int(t.text), pos)
        if t.kind == "bool":
            self.i += 1
            return Lit(t.text == "true", pos)
        if t.kind == "(":
            self.i += 1
            e = self.expr()
            if self.cur.kind == ",":
                self.i += 1
                r = self.expr()
                self.eat(")")
                return Pair(e, r, pos)
            self.eat(")")
            return e
        self.error()


def parse(src):
    p = _Parser(tokenize(src))
    e = p.expr()
    if p.cur.kind != "eof":
        p.error()
    return e
