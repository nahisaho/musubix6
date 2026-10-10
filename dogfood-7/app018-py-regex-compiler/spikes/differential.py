"""Development oracle for the compatible subset, not the runtime backend."""
import itertools
import re
from regexc.api import compile_pattern

atoms = ["a", "b", "", "(a)", "(a?)", "(?:a|aa)", "(?:|a)", "(?=a)", "(?!b)"]
quantifiers = ["", "?", "*", "+", "{0,2}", "{2}", "*?", "*+", "{2,3}", "{2,3}?", "{2,3}+"]
texts = ["", "a", "b", "aa", "ab", "aaa", "aab"]
count = 0
for atom, quantifier, suffix in itertools.product(atoms, quantifiers, ["", "a", "b"]):
    pattern = atom + quantifier + suffix
    try:
        oracle = re.compile(pattern)
    except re.error:
        continue
    compiled = compile_pattern(pattern)
    for text, method in itertools.product(texts, ["match", "fullmatch", "search"]):
        actual = getattr(compiled, method)(text)
        expected = getattr(oracle, method)(text)
        shape = lambda m: None if m is None else (m.span(), m.groups())
        assert shape(actual) == shape(expected), (pattern, text, method)
        count += 1
print(f"PASS: {count} differential operations")
