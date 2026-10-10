from dataclasses import dataclass
from types import MappingProxyType
from regexc.syntax import Parser
from regexc.nfa import Builder, regular
from regexc.vm import evaluate
from regexc.budget import Budget, StepLimitError


# @id CODE-CAPTURES-002
# @implements REQ-CAPTURES-009 REQ-CAPTURES-010
@dataclass(frozen=True)
class Match:
    text: str
    captures: tuple
    names: object

    def _index(self, key):
        if isinstance(key, str):
            if key not in self.names:
                raise IndexError("unknown group")
            key = self.names[key]
        if type(key) is not int or not 0 <= key < len(self.captures):
            raise IndexError("unknown group")
        return key

    def span(self, key=0):
        return self.captures[self._index(key)] or (-1, -1)

    def group(self, key=0):
        span = self.captures[self._index(key)]
        return None if span is None else self.text[span[0]:span[1]]

    def groups(self):
        return tuple(self.group(i) for i in range(1, len(self.captures)))

    def groupdict(self):
        return {key: self.group(key) for key in self.names}


# @id CODE-SAFETY-003
# @implements REQ-SAFETY-003 REQ-SAFETY-004 REQ-SAFETY-005 REQ-SAFETY-006 REQ-SAFETY-007 REQ-SAFETY-008 REQ-SAFETY-012
@dataclass(frozen=True)
class Pattern:
    source: str
    ast: tuple
    group_count: int
    names: object
    nfa: object

    @property
    def backend(self):
        return "nfa" if self.nfa is not None else "backtracking"

    def _validate(self, text, pos):
        if not isinstance(text, str):
            raise ValueError("text must be str")
        if len(text) > 512:
            raise ValueError("input length limit exceeded")
        if type(pos) is not int or not 0 <= pos <= len(text):
            raise ValueError("invalid position")

    def _match(self, text, pos, budget, full=False):
        if full and self.nfa is not None:
            if self.nfa.fullmatch(text, pos, budget):
                return Match(text, ((pos, len(text)),), self.names)
            return None
        captures = (None,) * (self.group_count + 1)
        for end, state in evaluate(self.ast, text, pos, captures, budget):
            if not full or end == len(text):
                return Match(text, ((pos, end),) + state[1:], self.names)
        return None

    def fullmatch(self, text, pos=0, step_limit=100000):
        return self._match(text, pos, self._operation(text, pos, step_limit), True)

    def match(self, text, pos=0, step_limit=100000):
        return self._match(text, pos, self._operation(text, pos, step_limit))

    def _operation(self, text, pos, step_limit):
        self._validate(text, pos)
        return Budget(step_limit)

    def _search(self, text, pos, budget):
        for start in range(pos, len(text) + 1):
            budget.tick()
            result = self._match(text, start, budget)
            if result is not None:
                return result
        return None

    def search(self, text, pos=0, step_limit=100000):
        return self._search(text, pos, self._operation(text, pos, step_limit))

    def finditer(self, text, pos=0, step_limit=100000):
        budget = self._operation(text, pos, step_limit)
        while pos <= len(text):
            result = self._search(text, pos, budget)
            if result is None:
                return
            yield result
            start, end = result.span()
            pos = end + 1 if end == start else end


def compile_pattern(pattern):
    if not isinstance(pattern, str) or len(pattern) > 4096:
        raise ValueError("pattern must be str of at most 4096 codepoints")
    parser = Parser(pattern)
    ast = parser.parse()
    nfa = Builder().build(ast) if regular(ast) else None
    return Pattern(pattern, ast, parser.groups, MappingProxyType(dict(parser.names)), nfa)
