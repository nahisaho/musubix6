use crate::span::Span;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TokenKind {
    Int(i64),
    Ident(String),
    Let,
    In,
    Fn,
    If,
    Then,
    Else,
    True,
    False,
    Plus,
    Minus,
    Star,
    Slash,
    Percent,
    EqEq,
    NotEq,
    Lt,
    Le,
    Gt,
    Ge,
    AndAnd,
    OrOr,
    Bang,
    Eq,
    FatArrow,
    Arrow,
    Colon,
    Comma,
    LParen,
    RParen,
    Eof,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Token {
    pub kind: TokenKind,
    pub span: Span,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LexError {
    pub message: String,
    pub span: Span,
}

/** @id CODE-LEX-001 @implements REQ-LEX-001 @implements REQ-LEX-002 @implements REQ-LEX-003 @implements REQ-LEX-004 @implements REQ-LEX-005 @implements REQ-LEX-006 @implements REQ-LEX-007 */
pub fn lex(src: &str) -> Result<Vec<Token>, LexError> {
    let bytes = src.as_bytes();
    let mut toks = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i];
        if c.is_ascii_whitespace() {
            i += 1;
            continue;
        }
        if c == b'#' {
            while i < bytes.len() && bytes[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        let start = i;
        if c.is_ascii_digit() {
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            let span = Span { start, end: i };
            let n = src[start..i].parse::<i64>().map_err(|_| LexError {
                message: "integer literal out of range".to_string(),
                span,
            })?;
            toks.push(Token { kind: TokenKind::Int(n), span });
            continue;
        }
        if c.is_ascii_alphabetic() || c == b'_' {
            while i < bytes.len() && (bytes[i].is_ascii_alphanumeric() || bytes[i] == b'_') {
                i += 1;
            }
            let kind = match &src[start..i] {
                "let" => TokenKind::Let,
                "in" => TokenKind::In,
                "fn" => TokenKind::Fn,
                "if" => TokenKind::If,
                "then" => TokenKind::Then,
                "else" => TokenKind::Else,
                "true" => TokenKind::True,
                "false" => TokenKind::False,
                id => TokenKind::Ident(id.to_string()),
            };
            toks.push(Token { kind, span: Span { start, end: i } });
            continue;
        }
        let next = bytes.get(i + 1).copied();
        let (kind, len) = match (c, next) {
            (b'=', Some(b'=')) => (TokenKind::EqEq, 2),
            (b'!', Some(b'=')) => (TokenKind::NotEq, 2),
            (b'<', Some(b'=')) => (TokenKind::Le, 2),
            (b'>', Some(b'=')) => (TokenKind::Ge, 2),
            (b'&', Some(b'&')) => (TokenKind::AndAnd, 2),
            (b'|', Some(b'|')) => (TokenKind::OrOr, 2),
            (b'=', Some(b'>')) => (TokenKind::FatArrow, 2),
            (b'-', Some(b'>')) => (TokenKind::Arrow, 2),
            (b'=', _) => (TokenKind::Eq, 1),
            (b'<', _) => (TokenKind::Lt, 1),
            (b'>', _) => (TokenKind::Gt, 1),
            (b'!', _) => (TokenKind::Bang, 1),
            (b'-', _) => (TokenKind::Minus, 1),
            (b'+', _) => (TokenKind::Plus, 1),
            (b'*', _) => (TokenKind::Star, 1),
            (b'/', _) => (TokenKind::Slash, 1),
            (b'%', _) => (TokenKind::Percent, 1),
            (b':', _) => (TokenKind::Colon, 1),
            (b',', _) => (TokenKind::Comma, 1),
            (b'(', _) => (TokenKind::LParen, 1),
            (b')', _) => (TokenKind::RParen, 1),
            _ => {
                let ch = src[i..].chars().next().unwrap();
                return Err(LexError {
                    message: format!("unexpected character '{}'", ch),
                    span: Span { start: i, end: i + ch.len_utf8() },
                });
            }
        };
        i += len;
        toks.push(Token { kind, span: Span { start, end: i } });
    }
    toks.push(Token { kind: TokenKind::Eof, span: Span { start: src.len(), end: src.len() } });
    Ok(toks)
}
