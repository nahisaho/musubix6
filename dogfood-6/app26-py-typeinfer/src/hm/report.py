import sys

from .infer import infer_program, InferError
from .parser import ParseError
from .pretty import Namer, show_type, show_scheme

USAGE = "usage: hm (-e <expr> | -)"


# @id CODE-REPORT-002 @implements REQ-REPORT-002 REQ-REPORT-006
def _context(src, line, col):
    lines = src.split("\n")
    text = lines[line - 1] if 0 < line <= len(lines) else ""
    prefix = "".join(ch if ch == "\t" else " " for ch in text[: col - 1])
    prefix += " " * max(0, col - 1 - len(text))
    return f"{text}\n{prefix}^"


# @id CODE-REPORT-003 @implements REQ-REPORT-003 REQ-REPORT-004 REQ-REPORT-005
def format_error(src, err):
    if isinstance(err, ParseError):
        line, col = err.line, err.col
        head = f"{line}:{col}: parse error: {err.msg}"
    else:
        line, col = err.pos or (1, 1)
        namer = Namer()
        if err.kind == "unbound":
            what = f"unbound variable {err.name}"
        elif err.kind == "occurs":
            what = f"infinite type: {show_type(err.var, namer)} ~ {show_type(err.type, namer)}"
        else:
            want = show_type(err.expected, namer)
            what = f"expected {want}, found {show_type(err.actual, namer)}"
        head = f"{line}:{col}: type error: {what}"
    return f"{head}\n{_context(src, line, col)}"


TOO_DEEP = "error: expression too deeply nested"


# @id CODE-REPORT-001 @implements REQ-REPORT-001 REQ-REPORT-008
def run(src):
    """Return (exit_code, stdout_text, stderr_text) for one program."""
    try:
        return 0, show_scheme(infer_program(src)), ""
    except ParseError as e:
        return 2, "", format_error(src, e)
    except InferError as e:
        return 1, "", format_error(src, e)
    except RecursionError:
        return 2, "", TOO_DEEP


def check(src):
    code, out, err = run(src)
    return out if code == 0 else err


# @id CODE-REPORT-007 @implements REQ-REPORT-007
def main(argv, stdin=None, stdout=None, stderr=None):
    stdin = stdin or sys.stdin
    stdout = stdout or sys.stdout
    stderr = stderr or sys.stderr
    if len(argv) == 2 and argv[0] == "-e":
        src = argv[1]
    elif argv == ["-"]:
        src = stdin.read()
    else:
        print(USAGE, file=stderr)
        return 2
    code, out, err = run(src)
    if code == 0:
        print(out, file=stdout)
    else:
        print(err, file=stderr)
    return code
