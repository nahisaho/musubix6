use exprlang_syntax::lexer::{lex, TokenKind};
use exprlang_syntax::span::Span;

fn kinds(src: &str) -> Vec<TokenKind> {
    lex(src).unwrap().into_iter().map(|t| t.kind).collect()
}

/** @id TEST-LEX-001 @verifies REQ-LEX-001 */
#[test]
fn test_lex_001_int_literal() {
    let toks = lex("  42").unwrap();
    assert_eq!(toks[0].kind, TokenKind::Int(42));
    assert_eq!(toks[0].span, Span { start: 2, end: 4 });
}

/** @id TEST-LEX-002 @verifies REQ-LEX-002 */
#[test]
fn test_lex_002_keywords_and_idents() {
    assert_eq!(
        kinds("let x in letx"),
        vec![
            TokenKind::Let,
            TokenKind::Ident("x".to_string()),
            TokenKind::In,
            TokenKind::Ident("letx".to_string()),
            TokenKind::Eof
        ]
    );
    assert_eq!(kinds("true false")[..2], [TokenKind::True, TokenKind::False]);
}

/** @id TEST-LEX-003 @verifies REQ-LEX-003 */
#[test]
fn test_lex_003_operators_longest_match() {
    assert_eq!(
        kinds("== != <= >= && || => -> = < > ! - +"),
        vec![
            TokenKind::EqEq,
            TokenKind::NotEq,
            TokenKind::Le,
            TokenKind::Ge,
            TokenKind::AndAnd,
            TokenKind::OrOr,
            TokenKind::FatArrow,
            TokenKind::Arrow,
            TokenKind::Eq,
            TokenKind::Lt,
            TokenKind::Gt,
            TokenKind::Bang,
            TokenKind::Minus,
            TokenKind::Plus,
            TokenKind::Eof
        ]
    );
}

/** @id TEST-LEX-004 @verifies REQ-LEX-004 */
#[test]
fn test_lex_004_skips_whitespace_and_comments() {
    let toks = lex("# c\n  7 # tail\n8").unwrap();
    assert_eq!(toks[0].kind, TokenKind::Int(7));
    assert_eq!(toks[0].span, Span { start: 6, end: 7 });
    assert_eq!(toks[1].kind, TokenKind::Int(8));
    assert_eq!(toks[1].span, Span { start: 15, end: 16 });
}

/** @id TEST-LEX-005 @verifies REQ-LEX-005 */
#[test]
fn test_lex_005_unknown_char() {
    let err = lex("1 + @").unwrap_err();
    assert_eq!(err.span, Span { start: 4, end: 5 });
}

/** @id TEST-LEX-006 @verifies REQ-LEX-006 */
#[test]
fn test_lex_006_int_overflow() {
    assert_eq!(kinds("9223372036854775807")[0], TokenKind::Int(i64::MAX));
    let err = lex("1 9223372036854775808").unwrap_err();
    assert_eq!(err.span, Span { start: 2, end: 21 });
}

/** @id TEST-LEX-007 @verifies REQ-LEX-007 */
#[test]
fn test_lex_007_eof_token() {
    let toks = lex("a ").unwrap();
    let last = toks.last().unwrap();
    assert_eq!(last.kind, TokenKind::Eof);
    assert_eq!(last.span, Span { start: 2, end: 2 });
    assert_eq!(lex("").unwrap().len(), 1);
}
