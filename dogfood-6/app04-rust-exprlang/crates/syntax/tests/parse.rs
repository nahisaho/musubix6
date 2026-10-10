use exprlang_syntax::ast::{BinOp, Expr, ExprKind, Ty, UnOp};
use exprlang_syntax::parser::parse;
use exprlang_syntax::span::Span;

fn ty(t: &Ty) -> String {
    match t {
        Ty::Int => "Int".to_string(),
        Ty::Bool => "Bool".to_string(),
        Ty::Fn(ps, r) => format!(
            "({})->{}",
            ps.iter().map(ty).collect::<Vec<_>>().join(","),
            ty(r)
        ),
    }
}

fn show(e: &Expr) -> String {
    match &e.kind {
        ExprKind::Int(n) => n.to_string(),
        ExprKind::Bool(b) => b.to_string(),
        ExprKind::Var(v) => v.clone(),
        ExprKind::Unary(op, x) => {
            let n = if *op == UnOp::Neg { "neg" } else { "not" };
            format!("({} {})", n, show(x))
        }
        ExprKind::Binary(op, l, r) => {
            let n = match op {
                BinOp::Add => "+",
                BinOp::Sub => "-",
                BinOp::Mul => "*",
                BinOp::Div => "/",
                BinOp::Rem => "%",
                BinOp::Eq => "==",
                BinOp::Ne => "!=",
                BinOp::Lt => "<",
                BinOp::Le => "<=",
                BinOp::Gt => ">",
                BinOp::Ge => ">=",
                BinOp::And => "&&",
                BinOp::Or => "||",
            };
            format!("({} {} {})", n, show(l), show(r))
        }
        ExprKind::If(c, a, b) => format!("(if {} {} {})", show(c), show(a), show(b)),
        ExprKind::Let(n, v, b) => format!("(let {} {} {})", n, show(v), show(b)),
        ExprKind::Lambda(ps, b) => format!(
            "(fn ({}) {})",
            ps.iter()
                .map(|p| format!("{}:{}", p.name, ty(&p.ty)))
                .collect::<Vec<_>>()
                .join(" "),
            show(b)
        ),
        ExprKind::Call(f, args) => format!(
            "(call {}{})",
            show(f),
            args.iter().map(|a| format!(" {}", show(a))).collect::<String>()
        ),
    }
}

/** @id TEST-PARSE-001 @verifies REQ-PARSE-001 */
#[test]
fn test_parse_001_precedence() {
    let e = parse("1 + 2 * 3").unwrap();
    assert_eq!(show(&e), "(+ 1 (* 2 3))");
    let e = parse("a || b && c == d < e + f * g").unwrap();
    assert_eq!(show(&e), "(|| a (&& b (== c (< d (+ e (* f g))))))");
    let e = parse("a % b - c / d").unwrap();
    assert_eq!(show(&e), "(- (% a b) (/ c d))");
}

/** @id TEST-PARSE-002 @verifies REQ-PARSE-002 */
#[test]
fn test_parse_002_left_assoc() {
    let e = parse("1 - 2 - 3").unwrap();
    assert_eq!(show(&e), "(- (- 1 2) 3)");
    let e = parse("a / b * c").unwrap();
    assert_eq!(show(&e), "(* (/ a b) c)");
    let e = parse("a && b && c").unwrap();
    assert_eq!(show(&e), "(&& (&& a b) c)");
}

/** @id TEST-PARSE-003 @verifies REQ-PARSE-003 */
#[test]
fn test_parse_003_unary() {
    let e = parse("-1 * 2").unwrap();
    assert_eq!(show(&e), "(* (neg 1) 2)");
    let e = parse("!a && b").unwrap();
    assert_eq!(show(&e), "(&& (not a) b)");
    let e = parse("- - 3").unwrap();
    assert_eq!(show(&e), "(neg (neg 3))");
}

/** @id TEST-PARSE-004 @verifies REQ-PARSE-004 */
#[test]
fn test_parse_004_parens() {
    let e = parse("(1 + 2) * 3").unwrap();
    assert_eq!(show(&e), "(* (+ 1 2) 3)");
    assert_eq!(e.span, Span { start: 0, end: 11 });
    if let ExprKind::Binary(_, l, _) = &e.kind {
        assert_eq!(l.span, Span { start: 0, end: 7 });
    } else {
        panic!("expected binary");
    }
}

/** @id TEST-PARSE-005 @verifies REQ-PARSE-005 */
#[test]
fn test_parse_005_let_if_fn() {
    let e = parse("let x = 1 in x + 2").unwrap();
    assert_eq!(show(&e), "(let x 1 (+ x 2))");
    let e = parse("if a then b else c + 1").unwrap();
    assert_eq!(show(&e), "(if a b (+ c 1))");
    let e = parse("fn(x: Int, y: Bool) => x || y").unwrap();
    assert_eq!(show(&e), "(fn (x:Int y:Bool) (|| x y))");
    let e = parse("let x = if a then 1 else 2 in x").unwrap();
    assert_eq!(show(&e), "(let x (if a 1 2) x)");
}

/** @id TEST-PARSE-006 @verifies REQ-PARSE-006 */
#[test]
fn test_parse_006_calls() {
    let e = parse("f(1)(2, 3)").unwrap();
    assert_eq!(show(&e), "(call (call f 1) 2 3)");
    let e = parse("-f(1) + g()").unwrap();
    assert_eq!(show(&e), "(+ (neg (call f 1)) (call g))");
    let e = parse("(fn(x: Int) => x)(4)").unwrap();
    assert_eq!(show(&e), "(call (fn (x:Int) x) 4)");
}

/** @id TEST-PARSE-007 @verifies REQ-PARSE-007 */
#[test]
fn test_parse_007_binary_span() {
    let e = parse("  1 + 2 * 3 ").unwrap();
    assert_eq!(e.span, Span { start: 2, end: 11 });
    if let ExprKind::Binary(_, _, r) = &e.kind {
        assert_eq!(r.span, Span { start: 6, end: 11 });
    } else {
        panic!("expected binary");
    }
    let c = parse("f(1, 2)").unwrap();
    assert_eq!(c.span, Span { start: 0, end: 7 });
}

/** @id TEST-PARSE-008 @verifies REQ-PARSE-008 */
#[test]
fn test_parse_008_errors() {
    assert_eq!(parse("1 + ").unwrap_err().span, Span { start: 4, end: 4 });
    assert_eq!(parse("1 + * 2").unwrap_err().span, Span { start: 4, end: 5 });
    assert_eq!(parse("(1").unwrap_err().span, Span { start: 2, end: 2 });
    assert_eq!(parse("1 2").unwrap_err().span, Span { start: 2, end: 3 });
    assert_eq!(parse("1 @").unwrap_err().span, Span { start: 2, end: 3 });
    assert_eq!(parse("").unwrap_err().span, Span { start: 0, end: 0 });
}

/** @id TEST-PARSE-009 @verifies REQ-PARSE-009 */
#[test]
fn test_parse_009_types() {
    let e = parse("fn(f: (Int, Bool) -> Int, g: Int) => f").unwrap();
    assert_eq!(show(&e), "(fn (f:(Int,Bool)->Int g:Int) f)");
    let e = parse("fn(h: (Int) -> (Int) -> Bool) => h").unwrap();
    assert_eq!(show(&e), "(fn (h:(Int)->(Int)->Bool) h)");
}
