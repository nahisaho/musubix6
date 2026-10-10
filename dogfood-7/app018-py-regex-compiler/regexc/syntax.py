from dataclasses import dataclass
import unicodedata


@dataclass(frozen=True)
class Predicate:
    kind: str
    value: object = None
    inverted: bool = False

    def accepts(self, char):
        if self.kind == "literal":
            result = char == self.value
        elif self.kind == "dot":
            result = char != "\n"
        elif self.kind == "range":
            result = self.value[0] <= char <= self.value[1]
        elif self.kind == "union":
            result = any(p.accepts(char) for p in self.value)
        elif self.kind == "category":
            result = unicodedata.category(char).startswith(self.value)
        elif self.kind == "digit":
            result = char.isdecimal()
        elif self.kind == "space":
            result = char.isspace()
        elif self.kind == "word":
            result = char.isalnum() or char == "_"
        else:
            raise ValueError("unknown predicate")
        return not result if self.inverted else result


# @id CODE-SYNTAX-001
# @implements REQ-SYNTAX-001 REQ-SYNTAX-002 REQ-SYNTAX-003 REQ-SYNTAX-004 REQ-SYNTAX-005 REQ-SYNTAX-006 REQ-SYNTAX-007 REQ-SYNTAX-008 REQ-SYNTAX-009 REQ-SYNTAX-010
class Parser:
    def __init__(self, pattern):
        self.pattern = pattern
        self.i = 0
        self.groups = 0
        self.names = {}
        self.open_groups = set()
        self.depth = 0

    def error(self, text):
        raise ValueError(f"{text} at offset {self.i}")

    def peek(self):
        return self.pattern[self.i:self.i + 1]

    def take(self):
        char = self.peek()
        self.i += 1
        return char

    def parse(self):
        result = self.alternation()
        if self.i != len(self.pattern):
            self.error("unmatched group")
        return result

    def alternation(self):
        branches = [self.sequence()]
        while self.peek() == "|":
            self.take()
            branches.append(self.sequence())
        return branches[0] if len(branches) == 1 else ("alt", tuple(branches))

    def sequence(self):
        nodes = []
        while self.peek() and self.peek() not in ")|":
            node = self.atom()
            if self.peek() and self.peek() in "*+?{":
                node = self.quantifier(node)
            nodes.append(node)
        return ("seq", tuple(nodes))

    def atom(self):
        char = self.take()
        if char in "*+?{":
            self.error("orphan quantifier")
        if char == "(":
            return self.group()
        if char == "[":
            return ("char", self.character_class())
        if char == "\\":
            return self.escape()
        if char == ".":
            return ("char", Predicate("dot"))
        if char in "^$":
            return ("anchor", char)
        return ("char", Predicate("literal", char))

    def escape(self, in_class=False):
        char = self.take()
        if not char:
            self.error("dangling escape")
        if char in "pP":
            if self.take() != "{":
                self.error("category requires braces")
            end = self.pattern.find("}", self.i)
            if end < 0:
                self.error("unclosed category")
            category = self.pattern[self.i:end]
            self.i = end + 1
            if category not in {"L", "Lu", "Ll", "N", "Nd", "Z"}:
                self.error("unknown category")
            return ("char", Predicate("category", category, char == "P"))
        if char.lower() in "dws":
            return ("char", Predicate({"d": "digit", "w": "word", "s": "space"}[char.lower()],
                                      inverted=char.isupper()))
        if char in "bB" and not in_class:
            return ("anchor", char)
        if char.isdigit() and not in_class:
            digits = char
            while self.peek().isdigit():
                digits += self.take()
            number = int(digits)
            if number < 1 or number > self.groups or number in self.open_groups:
                self.error("undefined or forward backreference")
            return ("ref", number)
        literal = {"n": "\n", "r": "\r", "t": "\t", "b": "\b"}.get(char, char)
        if char.isalpha() and char not in "nrtb":
            self.error("unknown escape")
        return ("char", Predicate("literal", literal))

    def character_class(self):
        inverted = self.peek() == "^"
        if inverted:
            self.take()
        predicates = []
        while self.peek() and self.peek() != "]":
            first = self.class_atom()
            if self.peek() == "-" and self.pattern[self.i + 1:self.i + 2] not in {"", "]"}:
                self.take()
                last = self.class_atom()
                if first.kind != "literal" or last.kind != "literal" or first.value > last.value:
                    self.error("invalid range")
                first = Predicate("range", (first.value, last.value))
            predicates.append(first)
        if self.take() != "]" or not predicates:
            self.error("unclosed or empty class")
        return Predicate("union", tuple(predicates), inverted)

    def class_atom(self):
        char = self.take()
        return self.escape(True)[1] if char == "\\" else Predicate("literal", char)

    def group(self):
        self.depth += 1
        if self.depth > 100:
            self.error("nesting limit exceeded")
        mode, name = "capture", None
        if self.peek() == "?":
            self.take()
            marker = self.take()
            if marker == ":":
                mode = "plain"
            elif marker == ">":
                mode = "atomic"
            elif marker in "=!":
                mode = "ahead" if marker == "=" else "not_ahead"
            elif marker == "<":
                direction = self.take()
                if direction not in "=!":
                    self.error("unknown group")
                mode = "behind" if direction == "=" else "not_behind"
            elif marker == "P" and self.peek() == "<":
                self.take()
                end = self.pattern.find(">", self.i)
                if end < 0:
                    self.error("unclosed name")
                name = self.pattern[self.i:end]
                self.i = end + 1
                if not name.isidentifier() or name in self.names:
                    self.error("invalid or duplicate name")
            elif marker == "P" and self.peek() == "=":
                self.take()
                end = self.pattern.find(")", self.i)
                if end < 0:
                    self.error("unclosed reference")
                name = self.pattern[self.i:end]
                self.i = end + 1
                self.depth -= 1
                if name not in self.names or self.names[name] in self.open_groups:
                    self.error("undefined reference")
                return ("ref", self.names[name])
            else:
                self.error("unknown group")
        number = None
        if mode == "capture":
            self.groups += 1
            number = self.groups
            self.open_groups.add(number)
            if name:
                self.names[name] = number
        child = self.alternation()
        if self.take() != ")":
            self.error("unclosed group")
        self.depth -= 1
        if number:
            self.open_groups.remove(number)
            return ("group", number, child)
        if mode == "plain":
            return child
        if mode == "atomic":
            return ("atomic", child)
        width = fixed_width(child) if "behind" in mode else 0
        if width is None:
            self.error("lookbehind requires fixed width")
        return ("look", mode, child, width)

    def quantifier(self, child):
        char = self.take()
        if char == "{":
            end = self.pattern.find("}", self.i)
            if end < 0:
                self.error("unclosed quantifier")
            bounds = self.pattern[self.i:end].split(",")
            self.i = end + 1
            if len(bounds) > 2 or not bounds[0].isdigit() or (len(bounds) == 2 and bounds[1] and not bounds[1].isdigit()):
                self.error("invalid quantifier")
            minimum = int(bounds[0])
            maximum = minimum if len(bounds) == 1 else (int(bounds[1]) if bounds[1] else None)
        else:
            minimum, maximum = {"*": (0, None), "+": (1, None), "?": (0, 1)}[char]
        if minimum > 1000 or (maximum is not None and (maximum < minimum or maximum > 1000)):
            self.error("quantifier bounds exceeded")
        mode = "greedy"
        if self.peek() and self.peek() in "?+":
            mode = "lazy" if self.take() == "?" else "possessive"
        if self.peek() and self.peek() in "*+?{":
            self.error("duplicate quantifier")
        return ("repeat", child, minimum, maximum, mode)


def fixed_width(node):
    kind = node[0]
    if kind == "char":
        return 1
    if kind in {"anchor", "look"}:
        return 0
    if kind == "ref":
        return None
    if kind == "group":
        return fixed_width(node[2])
    if kind == "atomic":
        return fixed_width(node[1])
    if kind == "seq":
        widths = [fixed_width(n) for n in node[1]]
        return None if None in widths else sum(widths)
    if kind == "alt":
        widths = {fixed_width(n) for n in node[1]}
        return widths.pop() if len(widths) == 1 else None
    if kind == "repeat":
        width = fixed_width(node[1])
        return width * node[2] if width is not None and node[2] == node[3] else None
    raise ValueError("unknown node")
