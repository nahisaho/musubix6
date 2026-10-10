use exprlang_syntax::ast::{Expr, Ty};
use exprlang_syntax::parser::parse;
use exprlang_syntax::span::Span;
use exprlang_types::{check, TypeError, TypeErrorKind};

fn p(src: &str) -> Expr {
    parse(src).unwrap()
}

fn int() -> Ty {
    Ty::Int
}

fn fnty(ps: Vec<Ty>, r: Ty) -> Ty {
    Ty::Fn(ps, Box::new(r))
}

fn err(src: &str) -> TypeError {
    check(&p(src)).unwrap_err()
}

/** @id TEST-TYPE-001 @verifies REQ-TYPE-001 */
#[test]
fn test_type_001_literals() {
    assert_eq!(check(&p("42")), Ok(Ty::Int));
    assert_eq!(check(&p("true")), Ok(Ty::Bool));
}

/** @id TEST-TYPE-002 @verifies REQ-TYPE-002 */
#[test]
fn test_type_002_operators() {
    assert_eq!(check(&p("1 + 2 * 3 - 4 / 2 % 5")), Ok(Ty::Int));
    assert_eq!(check(&p("-(1 + 2)")), Ok(Ty::Int));
    assert_eq!(check(&p("1 < 2")), Ok(Ty::Bool));
    assert_eq!(check(&p("true && false || true")), Ok(Ty::Bool));
    assert_eq!(check(&p("!true")), Ok(Ty::Bool));
    assert_eq!(check(&p("1 == 2")), Ok(Ty::Bool));
    assert_eq!(check(&p("true != false")), Ok(Ty::Bool));
}

/** @id TEST-TYPE-003 @verifies REQ-TYPE-003 */
#[test]
fn test_type_003_operand_mismatch() {
    let e = err("1 + true");
    assert_eq!(e.span, Span { start: 4, end: 8 });
    assert_eq!(e.kind, TypeErrorKind::Mismatch { expected: Ty::Int, found: Ty::Bool });
    let e = err("true && 1");
    assert_eq!(e.span, Span { start: 8, end: 9 });
    assert_eq!(e.kind, TypeErrorKind::Mismatch { expected: Ty::Bool, found: Ty::Int });
    let e = err("-true");
    assert_eq!(e.span, Span { start: 1, end: 5 });
    let e = err("1 == true");
    assert_eq!(e.span, Span { start: 5, end: 9 });
    assert_eq!(e.kind, TypeErrorKind::Mismatch { expected: Ty::Int, found: Ty::Bool });
}

/** @id TEST-TYPE-004 @verifies REQ-TYPE-004 */
#[test]
fn test_type_004_if() {
    assert_eq!(check(&p("if true then 1 else 2")), Ok(Ty::Int));
    let e = err("if 1 then 2 else 3");
    assert_eq!(e.span, Span { start: 3, end: 4 });
    let e = err("if true then 1 else false");
    assert_eq!(e.span, Span { start: 20, end: 25 });
    assert_eq!(e.kind, TypeErrorKind::Mismatch { expected: Ty::Int, found: Ty::Bool });
}

/** @id TEST-TYPE-005 @verifies REQ-TYPE-005 */
#[test]
fn test_type_005_let_and_vars() {
    assert_eq!(check(&p("let x = 1 in x + 1")), Ok(Ty::Int));
    assert_eq!(check(&p("let x = 1 in let x = true in x")), Ok(Ty::Bool));
    let e = err("let x = 1 in y");
    assert_eq!(e.span, Span { start: 13, end: 14 });
    assert_eq!(e.kind, TypeErrorKind::UnboundVar("y".to_string()));
    let e = err("(let x = 1 in x) + x");
    assert_eq!(e.span, Span { start: 19, end: 20 });
}

/** @id TEST-TYPE-006 @verifies REQ-TYPE-006 */
#[test]
fn test_type_006_lambda() {
    assert_eq!(check(&p("fn(x: Int) => x + 1")), Ok(fnty(vec![int()], Ty::Int)));
    assert_eq!(
        check(&p("fn(f: (Int) -> Bool, n: Int) => f(n)")),
        Ok(fnty(vec![fnty(vec![int()], Ty::Bool), int()], Ty::Bool))
    );
    assert_eq!(check(&p("fn() => true")), Ok(fnty(vec![], Ty::Bool)));
}

/** @id TEST-TYPE-007 @verifies REQ-TYPE-007 */
#[test]
fn test_type_007_calls() {
    assert_eq!(check(&p("(fn(x: Int) => x < 2)(1)")), Ok(Ty::Bool));
    let e = err("(fn(x: Int) => x)(1, 2)");
    assert_eq!(e.kind, TypeErrorKind::Arity { expected: 1, found: 2 });
    assert_eq!(e.span, Span { start: 0, end: 23 });
    let e = err("(fn(x: Int) => x)(true)");
    assert_eq!(e.span, Span { start: 18, end: 22 });
    assert_eq!(e.kind, TypeErrorKind::Mismatch { expected: Ty::Int, found: Ty::Bool });
    let e = err("1(2)");
    assert_eq!(e.kind, TypeErrorKind::NotCallable(Ty::Int));
    assert_eq!(e.span, Span { start: 0, end: 1 });
}

/** @id TEST-TYPE-008 @verifies REQ-TYPE-008 */
#[test]
fn test_type_008_function_equality() {
    let e = err("(fn(x: Int) => x) == (fn(x: Int) => x)");
    assert_eq!(e.span, Span { start: 0, end: 38 });
    assert_eq!(e.kind, TypeErrorKind::NotComparable(fnty(vec![int()], Ty::Int)));
}
