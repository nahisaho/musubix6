from .ast import (Between, Binary, Column, ColumnDef, CreateTable, Func, InList, Insert, IsNull,
                  Join, Like, Literal, OrderItem, Select, SelectItem, Star, TableRef, Unary)
from .errors import SqlError
from .lexer import tokenize

_COMPARE = ("=", "<>", "<", "<=", ">", ">=")


class ParseError(SqlError):
    def __init__(self, message, pos):
        super().__init__(f"{message} at offset {pos}")
        self.pos = pos


class Parser:
    def __init__(self, tokens):
        self.toks = tokens
        self.i = 0

    @property
    def tok(self):
        return self.toks[self.i]

    def advance(self):
        t = self.toks[self.i]
        if t.kind != "EOF":
            self.i += 1
        return t

    def is_kw(self, *words):
        return self.tok.kind == "KEYWORD" and self.tok.value in words

    def is_punct(self, ch):
        return self.tok.kind == "PUNCT" and self.tok.value == ch

    def is_op(self, *ops):
        return self.tok.kind == "OP" and self.tok.value in ops

    def accept_kw(self, *words):
        if self.is_kw(*words):
            return self.advance()
        return None

    def accept_punct(self, ch):
        if self.is_punct(ch):
            return self.advance()
        return None

    def expect_kw(self, word):
        if not self.is_kw(word):
            self.fail(f"expected {word}")
        return self.advance()

    def expect_punct(self, ch):
        if not self.is_punct(ch):
            self.fail(f"expected {ch!r}")
        return self.advance()

    def ident(self, what="identifier"):
        if self.tok.kind != "IDENT":
            self.fail(f"expected {what}")
        return self.advance().value

    def fail(self, message):
        raise ParseError(f"{message}, found {self.tok.kind} {self.tok.value!r}", self.tok.pos)

    # @id CODE-PAR-001 @implements REQ-PAR-008 @implements REQ-PAR-009 @implements REQ-PAR-010
    def statement(self):
        if self.is_kw("SELECT"):
            stmt = self.select()
        elif self.is_kw("CREATE"):
            stmt = self.create_table()
        elif self.is_kw("INSERT"):
            stmt = self.insert()
        else:
            self.fail("expected SELECT, CREATE or INSERT")
        self.accept_punct(";")
        if self.tok.kind != "EOF":
            self.fail("unexpected trailing input")
        return stmt

    def create_table(self):
        self.expect_kw("CREATE")
        self.expect_kw("TABLE")
        name = self.ident("table name")
        self.expect_punct("(")
        cols = []
        while True:
            cname = self.ident("column name")
            ctype = self.ident("column type").upper()
            not_null = False
            if self.accept_kw("NOT"):
                self.expect_kw("NULL")
                not_null = True
            cols.append(ColumnDef(cname, ctype, not_null))
            if not self.accept_punct(","):
                break
        self.expect_punct(")")
        return CreateTable(name, tuple(cols))

    def insert(self):
        self.expect_kw("INSERT")
        self.expect_kw("INTO")
        table = self.ident("table name")
        self.expect_kw("VALUES")
        rows = []
        while True:
            self.expect_punct("(")
            row = [self.expr()]
            while self.accept_punct(","):
                row.append(self.expr())
            self.expect_punct(")")
            rows.append(tuple(row))
            if not self.accept_punct(","):
                break
        return Insert(table, tuple(rows))

    # @id CODE-PAR-002 @implements REQ-PAR-001 @implements REQ-PAR-002 @implements REQ-PAR-007
    def select(self):
        self.expect_kw("SELECT")
        distinct = bool(self.accept_kw("DISTINCT"))
        items = [self.select_item()]
        while self.accept_punct(","):
            items.append(self.select_item())
        from_, joins = None, []
        if self.accept_kw("FROM"):
            from_ = self.table_ref()
            joins = self.joins()
        where = self.expr() if self.accept_kw("WHERE") else None
        group_by, having, order_by = [], None, []
        if self.accept_kw("GROUP"):
            self.expect_kw("BY")
            group_by.append(self.expr())
            while self.accept_punct(","):
                group_by.append(self.expr())
        if self.accept_kw("HAVING"):
            having = self.expr()
        if self.accept_kw("ORDER"):
            self.expect_kw("BY")
            order_by.append(self.order_item())
            while self.accept_punct(","):
                order_by.append(self.order_item())
        limit = offset = None
        if self.accept_kw("LIMIT"):
            limit = self.int_literal()
        if self.accept_kw("OFFSET"):
            offset = self.int_literal()
        return Select(tuple(items), from_, tuple(joins), where, tuple(group_by), having,
                      tuple(order_by), limit, offset, distinct)

    def int_literal(self):
        if self.tok.kind != "NUMBER" or not isinstance(self.tok.value, int):
            self.fail("expected integer")
        return self.advance().value

    def order_item(self):
        e = self.expr()
        desc = False
        if self.accept_kw("DESC"):
            desc = True
        else:
            self.accept_kw("ASC")
        return OrderItem(e, desc)

    def select_item(self):
        if self.is_op("*"):
            self.advance()
            return SelectItem(Star(None), None)
        if (self.tok.kind == "IDENT" and self.toks[self.i + 1].value == "."
                and self.toks[self.i + 2].value == "*" and self.toks[self.i + 2].kind == "OP"):
            t = self.advance().value
            self.advance()
            self.advance()
            return SelectItem(Star(t), None)
        e = self.expr()
        alias = None
        if self.accept_kw("AS"):
            alias = self.ident("alias")
        elif self.tok.kind == "IDENT":
            alias = self.advance().value
        return SelectItem(e, alias)

    def table_ref(self):
        name = self.ident("table name")
        alias = None
        if self.accept_kw("AS"):
            alias = self.ident("alias")
        elif self.tok.kind == "IDENT":
            alias = self.advance().value
        return TableRef(name, alias)

    def joins(self):
        out = []
        while True:
            if self.accept_punct(","):
                out.append(Join("CROSS", self.table_ref(), None))
            elif self.accept_kw("CROSS"):
                self.expect_kw("JOIN")
                out.append(Join("CROSS", self.table_ref(), None))
            elif self.is_kw("LEFT", "INNER", "JOIN"):
                kind = "INNER"
                if self.accept_kw("LEFT"):
                    kind = "LEFT"
                    self.accept_kw("OUTER")
                else:
                    self.accept_kw("INNER")
                self.expect_kw("JOIN")
                table = self.table_ref()
                self.expect_kw("ON")
                out.append(Join(kind, table, self.expr()))
            else:
                return out

    # @id CODE-PAR-003 @implements REQ-PAR-003 @implements REQ-PAR-004 @implements REQ-PAR-005
    # @implements REQ-PAR-006
    def expr(self):
        return self.or_expr()

    def or_expr(self):
        left = self.and_expr()
        while self.accept_kw("OR"):
            left = Binary("OR", left, self.and_expr())
        return left

    def and_expr(self):
        left = self.not_expr()
        while self.accept_kw("AND"):
            left = Binary("AND", left, self.not_expr())
        return left

    def not_expr(self):
        if self.accept_kw("NOT"):
            return Unary("NOT", self.not_expr())
        return self.predicate()

    def predicate(self):
        left = self.additive()
        while True:
            if self.is_op(*_COMPARE):
                op = self.advance().value
                left = Binary(op, left, self.additive())
            elif self.is_kw("IS"):
                self.advance()
                neg = bool(self.accept_kw("NOT"))
                self.expect_kw("NULL")
                left = IsNull(left, neg)
            elif self.is_kw("NOT", "IN", "BETWEEN", "LIKE"):
                neg = bool(self.accept_kw("NOT"))
                if self.accept_kw("IN"):
                    self.expect_punct("(")
                    items = [self.expr()]
                    while self.accept_punct(","):
                        items.append(self.expr())
                    self.expect_punct(")")
                    left = InList(left, tuple(items), neg)
                elif self.accept_kw("BETWEEN"):
                    low = self.additive()
                    self.expect_kw("AND")
                    left = Between(left, low, self.additive(), neg)
                elif self.accept_kw("LIKE"):
                    left = Like(left, self.additive(), neg)
                else:
                    self.fail("expected IN, BETWEEN or LIKE")
            else:
                return left

    def additive(self):
        left = self.multiplicative()
        while self.is_op("+", "-", "||"):
            op = self.advance().value
            left = Binary(op, left, self.multiplicative())
        return left

    def multiplicative(self):
        left = self.unary()
        while self.is_op("*", "/", "%"):
            op = self.advance().value
            left = Binary(op, left, self.unary())
        return left

    def unary(self):
        if self.is_op("-"):
            self.advance()
            return Unary("-", self.unary())
        return self.primary()

    def primary(self):
        t = self.tok
        if t.kind == "NUMBER" or t.kind == "STRING":
            self.advance()
            return Literal(t.value)
        if t.kind == "KEYWORD" and t.value in ("NULL", "TRUE", "FALSE"):
            self.advance()
            return Literal({"NULL": None, "TRUE": True, "FALSE": False}[t.value])
        if self.accept_punct("("):
            e = self.expr()
            self.expect_punct(")")
            return e
        if t.kind == "IDENT":
            self.advance()
            if self.accept_punct("("):
                return self.func_call(t.value)
            if self.accept_punct("."):
                return Column(t.value, self.ident("column name"))
            return Column(None, t.value)
        self.fail("expected expression")

    def func_call(self, name):
        name = name.upper()
        if self.is_op("*"):
            self.advance()
            self.expect_punct(")")
            return Func(name, (), True, False)
        distinct = bool(self.accept_kw("DISTINCT"))
        args = []
        if not self.is_punct(")"):
            args.append(self.expr())
            while self.accept_punct(","):
                args.append(self.expr())
        self.expect_punct(")")
        return Func(name, tuple(args), False, distinct)


def parse(sql):
    return Parser(tokenize(sql)).statement()
