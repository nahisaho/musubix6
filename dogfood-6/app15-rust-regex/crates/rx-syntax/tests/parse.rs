use rx_syntax::{parse, Ast, ClassSet, ErrorKind};

fn ok(s: &str) -> Ast {
    parse(s).unwrap().ast
}
fn lit(c: char) -> Ast {
    Ast::Literal(c)
}
fn err(s: &str) -> (ErrorKind, usize) {
    let e = parse(s).unwrap_err();
    (e.kind, e.pos)
}
fn rep(n: Ast, min: u32, max: Option<u32>, greedy: bool) -> Ast {
    Ast::Repeat { node: Box::new(n), min, max, greedy }
}

/** @id TEST-PARSE-001 @verifies REQ-PARSE-001 */
#[test]
fn test_parse_001_literals() {
    assert_eq!(ok("abc"), Ast::Concat(vec![lit('a'), lit('b'), lit('c')]));
    assert_eq!(ok("a"), lit('a'));
    assert_eq!(ok(""), Ast::Empty);
}

/** @id TEST-PARSE-002 @verifies REQ-PARSE-002 */
#[test]
fn test_parse_002_alternation() {
    assert_eq!(ok("a|b"), Ast::Alt(vec![lit('a'), lit('b')]));
    assert_eq!(ok("a|"), Ast::Alt(vec![lit('a'), Ast::Empty]));
    assert_eq!(ok("a|b|c"), Ast::Alt(vec![lit('a'), lit('b'), lit('c')]));
    assert_eq!(ok("ab|c"), Ast::Alt(vec![Ast::Concat(vec![lit('a'), lit('b')]), lit('c')]));
}

/** @id TEST-PARSE-003 @verifies REQ-PARSE-003 */
#[test]
fn test_parse_003_quantifiers() {
    assert_eq!(ok("a*"), rep(lit('a'), 0, None, true));
    assert_eq!(ok("a+"), rep(lit('a'), 1, None, true));
    assert_eq!(ok("a?"), rep(lit('a'), 0, Some(1), true));
    assert_eq!(ok("ab*"), Ast::Concat(vec![lit('a'), rep(lit('b'), 0, None, true)]));
}

/** @id TEST-PARSE-004 @verifies REQ-PARSE-004 */
#[test]
fn test_parse_004_counted() {
    assert_eq!(ok("a{3}"), rep(lit('a'), 3, Some(3), true));
    assert_eq!(ok("a{2,}"), rep(lit('a'), 2, None, true));
    assert_eq!(ok("a{2,5}"), rep(lit('a'), 2, Some(5), true));
    assert_eq!(err("a{3,2}").0, ErrorKind::BadRepeat);
    assert_eq!(err("a{1001}").0, ErrorKind::RepeatTooBig);
    assert_eq!(ok("a{1000}"), rep(lit('a'), 1000, Some(1000), true));
    assert_eq!(err("a{2").0, ErrorKind::BadRepeat);
}

/** @id TEST-PARSE-005 @verifies REQ-PARSE-005 */
#[test]
fn test_parse_005_lazy_and_double() {
    assert_eq!(ok("a*?"), rep(lit('a'), 0, None, false));
    assert_eq!(ok("a{2,3}?"), rep(lit('a'), 2, Some(3), false));
    assert_eq!(err("a**"), (ErrorKind::DoubleRepeat, 2));
    assert_eq!(err("a*+"), (ErrorKind::DoubleRepeat, 2));
    assert_eq!(err("a*??").0, ErrorKind::DoubleRepeat);
}

/** @id TEST-PARSE-006 @verifies REQ-PARSE-006 */
#[test]
fn test_parse_006_groups() {
    let p = parse("(a)(?:b)((c))").unwrap();
    assert_eq!(p.groups, 3);
    let g = |i, n| Ast::Group { index: i, node: Box::new(n) };
    assert_eq!(
        p.ast,
        Ast::Concat(vec![g(Some(1), lit('a')), g(None, lit('b')), g(Some(2), g(Some(3), lit('c')))])
    );
}

/** @id TEST-PARSE-007 @verifies REQ-PARSE-007 */
#[test]
fn test_parse_007_classes() {
    let a = ok("[a-cb-fx]");
    assert_eq!(a, Ast::Class(ClassSet::from_ranges(vec![(97, 102), (120, 120)])));
    if let Ast::Class(c) = ok("[a-cd-f]") {
        assert_eq!(c.ranges(), &[(97, 102)]);
    } else {
        panic!("not class");
    }
    if let Ast::Class(c) = ok("[^a]") {
        assert_eq!(c.ranges(), &[(0, 96), (98, 0x10FFFF)]);
        assert!(c.contains('b') && !c.contains('a'));
    } else {
        panic!("not class");
    }
    assert_eq!(err("[z-a]").0, ErrorKind::BadRange);
}

/** @id TEST-PARSE-008 @verifies REQ-PARSE-008 */
#[test]
fn test_parse_008_escapes() {
    assert_eq!(ok(r"\."), lit('.'));
    assert_eq!(ok(r"\n"), lit('\n'));
    assert_eq!(ok(r"\t"), lit('\t'));
    if let Ast::Class(c) = ok(r"\d") {
        assert_eq!(c.ranges(), &[(48, 57)]);
    } else {
        panic!()
    }
    if let Ast::Class(c) = ok(r"\W") {
        assert!(c.contains(' ') && !c.contains('_'));
    } else {
        panic!()
    }
    assert_eq!(err("a\\").0, ErrorKind::TrailingBackslash);
    assert_eq!(err(r"\q"), (ErrorKind::BadEscape, 0));
}

/** @id TEST-PARSE-009 @verifies REQ-PARSE-009 */
#[test]
fn test_parse_009_dot_anchors() {
    assert_eq!(ok("^a.$"), Ast::Concat(vec![Ast::Start, lit('a'), Ast::Any, Ast::End]));
}

/** @id TEST-PARSE-010 @verifies REQ-PARSE-010 */
#[test]
fn test_parse_010_error_positions() {
    assert_eq!(err("ab)"), (ErrorKind::UnmatchedClose, 2));
    assert_eq!(err("x(a"), (ErrorKind::UnclosedGroup, 1));
    assert_eq!(err("*a"), (ErrorKind::NothingToRepeat, 0));
    assert_eq!(err("a|+"), (ErrorKind::NothingToRepeat, 2));
    assert_eq!(err("é[a"), (ErrorKind::UnclosedClass, 1));
}

/** @id TEST-PARSE-011 @verifies REQ-PARSE-011 */
#[test]
fn test_parse_011_depth_limit() {
    let deep = format!("{}a{}", "(".repeat(201), ")".repeat(201));
    assert_eq!(parse(&deep).unwrap_err().kind, ErrorKind::TooDeep);
    let fine = format!("{}a{}", "(".repeat(200), ")".repeat(200));
    assert!(parse(&fine).is_ok());
}

/** @id TEST-PARSE-012 @verifies REQ-PARSE-012 */
#[test]
fn test_parse_012_roundtrip() {
    for s in [
        "a|b*c", r"\.\*\(", "(a|b)+?c{2,3}", "[^a-z0-9_]x", "(?:ab)*(c)", "^a.$", "[]-]", "a||b", r"\n\t", "()", "(|a)",
    ] {
        let Ok(p) = parse(s) else { continue };
        let again = parse(&p.ast.to_pattern()).unwrap();
        assert_eq!(p.ast, again.ast, "pattern {s}");
    }
    let p = parse("[a-c]|é\u{10FFFF}").unwrap();
    assert_eq!(parse(&p.ast.to_pattern()).unwrap().ast, p.ast);
}
