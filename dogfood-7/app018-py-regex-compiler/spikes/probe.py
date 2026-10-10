"""Executable assumptions, not gate tests."""
import re
import unicodedata

assert unicodedata.category("٤") == "Nd"
assert unicodedata.category("Ω") == "Lu"
assert re.fullmatch("a*+a", "aaa") is None
assert re.search("(?<=ab|cd)e", "cde").span() == (2, 3)
assert re.fullmatch("(a)c|ab", "ab").group(1) is None
print("PASS: Unicode, possessive cut, fixed-width alternatives, capture rollback")
