use exprlang_eval::{eval, EvalError, EvalErrorKind, Value};
use exprlang_syntax::parser::parse;
use exprlang_syntax::span::Span;
use exprlang_types::check;

fn run(src: &str) -> Result<Value, EvalError> {
    eval(&parse(src).unwrap())
}

fn sp(start: usize, end: usize) -> Span {
    Span { start, end }
}

/** @id TEST-EVAL-001 @verifies REQ-EVAL-001 */
#[test]
fn test_eval_001_arithmetic() {
    assert_eq!(run("1 + 2 * 3"), Ok(Value::Int(7)));
    assert_eq!(run("7 % 3 - -2"), Ok(Value::Int(3)));
    assert_eq!(run("1 < 2"), Ok(Value::Bool(true)));
    assert_eq!(run("!false == true"), Ok(Value::Bool(true)));
    assert_eq!(run("true != false"), Ok(Value::Bool(true)));
    assert_eq!(run("(1 + 1) >= 3"), Ok(Value::Bool(false)));
}

/** @id TEST-EVAL-002 @verifies REQ-EVAL-002 */
#[test]
fn test_eval_002_overflow() {
    let e = run("9223372036854775807 + 1").unwrap_err();
    assert_eq!(e.kind, EvalErrorKind::Overflow);
    assert_eq!(e.span, sp(0, 23));
    let e = run("0 - 9223372036854775807 - 2").unwrap_err();
    assert_eq!(e.span, sp(0, 27));
    let e = run("4611686018427387904 * 2").unwrap_err();
    assert_eq!(e.kind, EvalErrorKind::Overflow);
    let e = run("-(0 - 9223372036854775807 - 1)").unwrap_err();
    assert_eq!(e.kind, EvalErrorKind::Overflow);
}

/** @id TEST-EVAL-003 @verifies REQ-EVAL-003 */
#[test]
fn test_eval_003_div_zero() {
    let e = run("10 / (5 - 5)").unwrap_err();
    assert_eq!(e.kind, EvalErrorKind::DivZero);
    assert_eq!(e.span, sp(5, 12));
    let e = run("7 % 0").unwrap_err();
    assert_eq!(e.span, sp(4, 5));
}

/** @id TEST-EVAL-004 @verifies REQ-EVAL-004 */
#[test]
fn test_eval_004_short_circuit() {
    assert_eq!(run("false && (1 / 0 == 0)"), Ok(Value::Bool(false)));
    assert_eq!(run("true || (1 / 0 == 0)"), Ok(Value::Bool(true)));
    let e = run("true && (1 / 0 == 0)").unwrap_err();
    assert_eq!(e.kind, EvalErrorKind::DivZero);
}

/** @id TEST-EVAL-005 @verifies REQ-EVAL-005 */
#[test]
fn test_eval_005_let_if_scoping() {
    assert_eq!(run("let x = 1 in let x = x + 1 in x"), Ok(Value::Int(2)));
    assert_eq!(run("if 1 < 2 then 10 else 1 / 0"), Ok(Value::Int(10)));
    assert_eq!(run("(let x = 5 in x) + (let x = 6 in x)"), Ok(Value::Int(11)));
}

/** @id TEST-EVAL-006 @verifies REQ-EVAL-006 */
#[test]
fn test_eval_006_closure_capture() {
    let src = "let a = 1 in let f = fn(x: Int) => x + a in let a = 10 in f(1)";
    assert_eq!(run(src), Ok(Value::Int(2)));
}

/** @id TEST-EVAL-007 @verifies REQ-EVAL-007 */
#[test]
fn test_eval_007_higher_order() {
    let src = "let add = fn(a: Int) => fn(b: Int) => a + b in add(3)(4)";
    assert_eq!(run(src), Ok(Value::Int(7)));
    let src = "let twice = fn(f: (Int) -> Int, x: Int) => f(f(x)) in twice(fn(n: Int) => n * 2, 5)";
    assert_eq!(run(src), Ok(Value::Int(20)));
}

/** @id TEST-EVAL-008 @verifies REQ-EVAL-008 */
#[test]
fn test_eval_008_runtime_errors() {
    let e = run("f(1)").unwrap_err();
    assert_eq!(e.kind, EvalErrorKind::Unbound("f".to_string()));
    assert_eq!(e.span, sp(0, 1));
    let e = run("1(2)").unwrap_err();
    assert_eq!(e.kind, EvalErrorKind::NotCallable);
    assert_eq!(e.span, sp(0, 4));
    let e = run("(fn(x: Int) => x)(1, 2)").unwrap_err();
    assert_eq!(e.kind, EvalErrorKind::Arity { expected: 1, found: 2 });
    assert_eq!(e.span, sp(0, 23));
}

/** @id TEST-EVAL-009 @verifies REQ-EVAL-009 */
#[test]
fn test_eval_009_depth_limit() {
    let e = run("let w = fn(x: Int) => x(x) in w(w)").unwrap_err();
    assert_eq!(e.kind, EvalErrorKind::StackOverflow);
}

/** @id TEST-EVAL-010 @verifies REQ-EVAL-010 */
#[test]
fn test_eval_010_display() {
    assert_eq!(run("0 - 5").unwrap().to_string(), "-5");
    assert_eq!(run("1 == 1").unwrap().to_string(), "true");
    assert_eq!(run("fn(x: Int, y: Int) => x").unwrap().to_string(), "<fn/2>");
}

/** @id TEST-EVAL-011 @verifies REQ-EVAL-011 */
#[test]
fn test_eval_011_typed_programs_have_no_scope_errors() {
    let progs = [
        "let f = fn(x: Int) => x + 1 in f(f(1))",
        "let k = fn(a: Int) => fn(b: Bool) => a in k(1)(true)",
        "(fn(f: (Int) -> Int) => f(2))(fn(n: Int) => n / 0)",
        "if true then (fn(x: Int) => x) else (fn(y: Int) => y + 1)",
    ];
    for src in progs {
        let ast = parse(src).unwrap();
        assert!(check(&ast).is_ok(), "{}", src);
        if let Err(e) = eval(&ast) {
            assert_eq!(e.kind, EvalErrorKind::DivZero, "{}", src);
        }
    }
}

/** @id TEST-EVAL-012 @verifies REQ-EVAL-012 */
#[test]
fn test_eval_012_min_div_neg_one() {
    let min = "(0 - 9223372036854775807 - 1)";
    let src = format!("{} / (0 - 1)", min);
    let e = run(&src).unwrap_err();
    assert_eq!(e.kind, EvalErrorKind::Overflow);
    assert_eq!(e.span, sp(0, src.len()));
    let e = run(&format!("{} % (0 - 1)", min)).unwrap_err();
    assert_eq!(e.kind, EvalErrorKind::Overflow);
}
