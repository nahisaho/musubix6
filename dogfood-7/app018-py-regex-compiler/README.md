# Bounded hybrid regex compiler

Python 3.11+; no runtime dependencies. Run `python3 -m pytest -q`.

```python
from regexc.api import compile_pattern, StepLimitError

p = compile_pattern(r"(?P<word>\p{L}+)-(?P=word)")
assert p.fullmatch("漢-漢").group("word") == "漢"
assert compile_pattern(r"(?<=ab)c").search("abc").span() == (2, 3)
```

Supported: concatenation, ordered alternation, captures/noncaptures, named and
numeric backreferences, bracket/range/complement classes, Unicode categories
`L Lu Ll N Nd Z`, `\d \w \s` and complements, dot, strict `^ $`, word
boundaries, greedy/lazy/possessive `* + ? {m,n}`, atomic groups, lookahead and
fixed-width lookbehind. Forward/open-group backreferences are rejected.

Fullmatch uses Thompson NFA when the AST has no captures, assertions, references,
atomic groups or possessive cuts; ordered prefix/search operations and complex
patterns use an explicit-stack backtracking VM. All nested evaluation shares one
transition budget; exhaustion raises `StepLimitError`, not a silent nonmatch.
Each operation has fresh captures and a fresh budget; compiled patterns are immutable.

`match`, `fullmatch`, `search`, and `finditer` accept `pos=0, step_limit=100000`.
`finditer` is nonoverlapping and advances a codepoint after empty matches.
Match supports `group`, `groups`, `groupdict`, `span`; missing groups return None.
Limits: 4096 pattern codepoints, 100 group levels, repeat bounds ≤1000,
10000 NFA states, 512 input codepoints. Invalid arguments raise ValueError.
No bytes, flags, streaming, locale semantics or wall-clock deadline.

## Workflow evidence

Five T2 features; specs/plan/review/locks and hash-chained Reds/Greens in `.sdd/`.
Three bug-fix cycles: nullable capture commit, flat VM stack overflow and finite nullable ordering.
One API-validation refactor; Unicode/possessive spike in `spikes/probe.py`.
Known nested-git changed-scope defect can select zero evidence even from the
app directory; final full gate is authoritative. No skill files were modified.
