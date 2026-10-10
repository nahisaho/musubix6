import io
from hm.types import TVar, INT, BOOL, fn
from hm.infer import InferError
from hm.report import check, format_error, main

a, b = TVar(5), TVar(6)


# @id TEST-REPORT-001
# @verifies REQ-REPORT-001
def test_report_001_success_shows_scheme():
    assert check("1 + 2") == "Int"
    assert check("\\x. x") == "forall a. a -> a"
    assert check("\\f g x. f (g x)") == "forall a b c. (a -> b) -> (c -> a) -> c -> b"
    assert check("let id = \\x. x in (id 1, id true)") == "Int * Bool"


# @id TEST-REPORT-002
# @verifies REQ-REPORT-002
def test_report_002_parse_error_with_caret():
    out = check("let x = $")
    assert out == "1:9: parse error: unexpected character '$'\nlet x = $\n        ^"
    out = check("1 +")
    assert out.splitlines()[0].startswith("1:4: parse error")
    assert out.splitlines()[2] == "   ^"


# @id TEST-REPORT-003
# @verifies REQ-REPORT-003
def test_report_003_mismatch_shared_names():
    out = check("\\f. (f 1, f true)")
    assert out == ("1:13: type error: expected Int, found Bool\n"
                   "\\f. (f 1, f true)\n"
                   "            ^")
    err = InferError("mismatch", "type mismatch", (1, 1), fn(a, b), fn(b, a))
    assert format_error("x", err).splitlines()[0] == (
        "1:1: type error: expected a -> b, found b -> a")


# @id TEST-REPORT-004
# @verifies REQ-REPORT-004
def test_report_004_occurs():
    out = check("\\x. x x")
    assert out.splitlines()[0] == "1:5: type error: infinite type: a ~ a -> b"
    assert out.splitlines()[2] == "    ^"


# @id TEST-REPORT-005
# @verifies REQ-REPORT-005
def test_report_005_unbound():
    assert check("1 + zz") == "1:5: type error: unbound variable zz\n1 + zz\n    ^"


# @id TEST-REPORT-006
# @verifies REQ-REPORT-006
def test_report_006_caret_tabs_and_lines():
    out = check("let a = 1 in\n\t@")
    assert out == "2:2: parse error: unexpected character '@'\n\t@\n\t^"
    out = check("let a = 1 in\nlet b = 2 in\n  a + true")
    assert out.splitlines()[0].startswith("3:7: type error")
    assert out.splitlines()[1] == "  a + true"
    assert out.splitlines()[2] == "      ^"
    out = check("let a = 1 in\n")
    assert out.splitlines()[0].startswith("2:1: parse error")
    assert out.splitlines()[1] == ""


# @id TEST-REPORT-007
# @verifies REQ-REPORT-007
def test_report_007_exit_codes():
    def run(argv, stdin=""):
        o, e = io.StringIO(), io.StringIO()
        code = main(argv, io.StringIO(stdin), o, e)
        return code, o.getvalue(), e.getvalue()

    assert run(["-e", "1 + 2"]) == (0, "Int\n", "")
    assert run(["-"], "\\x. x")[:2] == (0, "forall a. a -> a\n")
    code, out, err = run(["-e", "1 + true"])
    assert code == 1 and out == "" and "type error" in err
    code, out, err = run(["-e", "1 +"])
    assert code == 2 and "parse error" in err
    code, out, err = run([])
    assert code == 2 and "usage" in err


# @id TEST-REPORT-008
# @verifies REQ-REPORT-008
def test_report_008_recursion_overflow_is_reported():
    big = "1" + " + 1" * 900
    assert check(big) == "error: expression too deeply nested"
    o, e = io.StringIO(), io.StringIO()
    assert main(["-e", big], io.StringIO(""), o, e) == 2
    assert e.getvalue() == "error: expression too deeply nested\n" and o.getvalue() == ""
    assert check("1" + " + 1" * 20) == "Int"
