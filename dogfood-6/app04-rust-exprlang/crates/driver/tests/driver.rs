use exprlang_driver::{line_col, render_error, run, Error};
use exprlang_eval::{EvalErrorKind, Value};
use exprlang_types::TypeErrorKind;

/** @id TEST-DRV-001 @verifies REQ-DRV-001 */
#[test]
fn test_drv_001_run_pipeline() {
    assert_eq!(run("let x = 2 in x * 21"), Ok(Value::Int(42)));
    assert_eq!(run("(fn(a: Int) => a < 3)(2)"), Ok(Value::Bool(true)));
}

/** @id TEST-DRV-002 @verifies REQ-DRV-002 */
#[test]
fn test_drv_002_stage_errors() {
    assert!(matches!(run("1 +"), Err(Error::Parse(_))));
    assert!(matches!(run("1 @ 2"), Err(Error::Parse(_))));
    match run("(1 / 0) + true") {
        Err(Error::Type(e)) => assert!(matches!(e.kind, TypeErrorKind::Mismatch { .. })),
        other => panic!("expected type error, got {:?}", other),
    }
    match run("1 / 0") {
        Err(Error::Eval(e)) => assert_eq!(e.kind, EvalErrorKind::DivZero),
        other => panic!("expected eval error, got {:?}", other),
    }
}

/** @id TEST-DRV-003 @verifies REQ-DRV-003 */
#[test]
fn test_drv_003_render() {
    let src = "1 + true";
    let err = run(src).unwrap_err();
    assert_eq!(
        render_error(src, &err),
        "1:5: type mismatch: expected Int, found Bool\n1 + true\n    ^^^^"
    );
    let src = "1 +";
    let err = run(src).unwrap_err();
    let out = render_error(src, &err);
    assert!(out.starts_with("1:4: "), "{}", out);
    assert!(out.ends_with("1 +\n   ^"), "{}", out);
}

/** @id TEST-DRV-004 @verifies REQ-DRV-004 */
#[test]
fn test_drv_004_line_col() {
    assert_eq!(line_col("a\nbc", 0), (1, 1));
    assert_eq!(line_col("a\nbc", 3), (2, 2));
    assert_eq!(line_col("a\nbc", 4), (2, 3));
    let src = "# é\n1 + true";
    let err = run(src).unwrap_err();
    assert_eq!(
        render_error(src, &err),
        "2:5: type mismatch: expected Int, found Bool\n1 + true\n    ^^^^"
    );
}
