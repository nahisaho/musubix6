use crate::ast::{BinOp, Expr, ExprKind, Param, Ty, UnOp};
use crate::lexer::{lex, LexError, Token, TokenKind};
use crate::span::Span;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    pub message: String,
    pub span: Span,
}

impl From<LexError> for ParseError {
    fn from(e: LexError) -> Self {
        ParseError { message: e.message, span: e.span }
    }
}

struct Parser {
    toks: Vec<Token>,
    pos: usize,
}

const PREFIX_BP: u8 = 13;

/** @id CODE-PARSE-001 @implements REQ-PARSE-001 @implements REQ-PARSE-002 */
fn infix_bp(kind: &TokenKind) -> Option<(BinOp, u8, u8)> {
    Some(match kind {
        TokenKind::OrOr => (BinOp::Or, 1, 2),
        TokenKind::AndAnd => (BinOp::And, 3, 4),
        TokenKind::EqEq => (BinOp::Eq, 5, 6),
        TokenKind::NotEq => (BinOp::Ne, 5, 6),
        TokenKind::Lt => (BinOp::Lt, 7, 8),
        TokenKind::Le => (BinOp::Le, 7, 8),
        TokenKind::Gt => (BinOp::Gt, 7, 8),
        TokenKind::Ge => (BinOp::Ge, 7, 8),
        TokenKind::Plus => (BinOp::Add, 9, 10),
        TokenKind::Minus => (BinOp::Sub, 9, 10),
        TokenKind::Star => (BinOp::Mul, 11, 12),
        TokenKind::Slash => (BinOp::Div, 11, 12),
        TokenKind::Percent => (BinOp::Rem, 11, 12),
        _ => return None,
    })
}

impl Parser {
    fn peek(&self) -> &Token {
        &self.toks[self.pos]
    }

    fn bump(&mut self) -> Token {
        let t = self.toks[self.pos].clone();
        if self.pos + 1 < self.toks.len() {
            self.pos += 1;
        }
        t
    }

    fn err<T>(&self, what: &str) -> Result<T, ParseError> {
        let t = self.peek();
        Err(ParseError { message: format!("{}, found {:?}", what, t.kind), span: t.span })
    }

    fn expect(&mut self, kind: TokenKind, what: &str) -> Result<Token, ParseError> {
        if self.peek().kind == kind {
            Ok(self.bump())
        } else {
            self.err(what)
        }
    }

    fn ident(&mut self) -> Result<(String, Span), ParseError> {
        if let TokenKind::Ident(name) = self.peek().kind.clone() {
            let t = self.bump();
            Ok((name, t.span))
        } else {
            self.err("expected identifier")
        }
    }

    // items up to (not including) the closing ')'
    fn comma_list<T>(&mut self, mut item: impl FnMut(&mut Self) -> Result<T, ParseError>) -> Result<Vec<T>, ParseError> {
        let mut items = Vec::new();
        if self.peek().kind != TokenKind::RParen {
            loop {
                items.push(item(self)?);
                if self.peek().kind != TokenKind::Comma {
                    break;
                }
                self.bump();
            }
        }
        Ok(items)
    }

    /** @id CODE-PARSE-002 @implements REQ-PARSE-007 */
    fn expr(&mut self, min_bp: u8) -> Result<Expr, ParseError> {
        let mut lhs = self.prefix()?;
        loop {
            if self.peek().kind == TokenKind::LParen {
                lhs = self.call(lhs)?;
                continue;
            }
            let Some((op, lbp, rbp)) = infix_bp(&self.peek().kind) else { break };
            if lbp < min_bp {
                break;
            }
            self.bump();
            let rhs = self.expr(rbp)?;
            let span = Span { start: lhs.span.start, end: rhs.span.end };
            lhs = Expr { kind: ExprKind::Binary(op, Box::new(lhs), Box::new(rhs)), span };
        }
        Ok(lhs)
    }

    /** @id CODE-PARSE-003 @implements REQ-PARSE-006 */
    fn call(&mut self, callee: Expr) -> Result<Expr, ParseError> {
        self.bump();
        let args = self.comma_list(|p| p.expr(0))?;
        let close = self.expect(TokenKind::RParen, "expected ')'")?;
        let span = Span { start: callee.span.start, end: close.span.end };
        Ok(Expr { kind: ExprKind::Call(Box::new(callee), args), span })
    }

    /** @id CODE-PARSE-004 @implements REQ-PARSE-003 @implements REQ-PARSE-004 @implements REQ-PARSE-005 @implements REQ-PARSE-008 */
    fn prefix(&mut self) -> Result<Expr, ParseError> {
        let t = self.peek().clone();
        match t.kind {
            TokenKind::Int(n) => {
                self.bump();
                Ok(Expr { kind: ExprKind::Int(n), span: t.span })
            }
            TokenKind::True | TokenKind::False => {
                self.bump();
                Ok(Expr { kind: ExprKind::Bool(t.kind == TokenKind::True), span: t.span })
            }
            TokenKind::Ident(name) => {
                self.bump();
                Ok(Expr { kind: ExprKind::Var(name), span: t.span })
            }
            TokenKind::LParen => {
                self.bump();
                let mut inner = self.expr(0)?;
                let close = self.expect(TokenKind::RParen, "expected ')'")?;
                inner.span = Span { start: t.span.start, end: close.span.end };
                Ok(inner)
            }
            TokenKind::Minus | TokenKind::Bang => {
                self.bump();
                let op = if t.kind == TokenKind::Minus { UnOp::Neg } else { UnOp::Not };
                let operand = self.expr(PREFIX_BP)?;
                let span = Span { start: t.span.start, end: operand.span.end };
                Ok(Expr { kind: ExprKind::Unary(op, Box::new(operand)), span })
            }
            TokenKind::Let => {
                self.bump();
                let (name, _) = self.ident()?;
                self.expect(TokenKind::Eq, "expected '='")?;
                let value = self.expr(0)?;
                self.expect(TokenKind::In, "expected 'in'")?;
                let body = self.expr(0)?;
                let span = Span { start: t.span.start, end: body.span.end };
                Ok(Expr { kind: ExprKind::Let(name, Box::new(value), Box::new(body)), span })
            }
            TokenKind::If => {
                self.bump();
                let c = self.expr(0)?;
                self.expect(TokenKind::Then, "expected 'then'")?;
                let a = self.expr(0)?;
                self.expect(TokenKind::Else, "expected 'else'")?;
                let b = self.expr(0)?;
                let span = Span { start: t.span.start, end: b.span.end };
                Ok(Expr { kind: ExprKind::If(Box::new(c), Box::new(a), Box::new(b)), span })
            }
            TokenKind::Fn => {
                self.bump();
                self.expect(TokenKind::LParen, "expected '('")?;
                let params = self.comma_list(|p| {
                    let (name, nspan) = p.ident()?;
                    p.expect(TokenKind::Colon, "expected ':'")?;
                    let (ty, tspan) = p.ty()?;
                    Ok(Param { name, ty, span: Span { start: nspan.start, end: tspan.end } })
                })?;
                self.expect(TokenKind::RParen, "expected ')'")?;
                self.expect(TokenKind::FatArrow, "expected '=>'")?;
                let body = self.expr(0)?;
                let span = Span { start: t.span.start, end: body.span.end };
                Ok(Expr { kind: ExprKind::Lambda(params, Box::new(body)), span })
            }
            _ => self.err("expected expression"),
        }
    }

    /** @id CODE-PARSE-005 @implements REQ-PARSE-009 */
    fn ty(&mut self) -> Result<(Ty, Span), ParseError> {
        let t = self.peek().clone();
        match t.kind {
            TokenKind::Ident(ref n) if n == "Int" => {
                self.bump();
                Ok((Ty::Int, t.span))
            }
            TokenKind::Ident(ref n) if n == "Bool" => {
                self.bump();
                Ok((Ty::Bool, t.span))
            }
            TokenKind::LParen => {
                self.bump();
                let params = self.comma_list(|p| Ok(p.ty()?.0))?;
                self.expect(TokenKind::RParen, "expected ')'")?;
                self.expect(TokenKind::Arrow, "expected '->'")?;
                let (ret, rspan) = self.ty()?;
                Ok((Ty::Fn(params, Box::new(ret)), Span { start: t.span.start, end: rspan.end }))
            }
            _ => self.err("expected type"),
        }
    }
}

pub fn parse(src: &str) -> Result<Expr, ParseError> {
    let mut p = Parser { toks: lex(src)?, pos: 0 };
    let e = p.expr(0)?;
    if p.peek().kind != TokenKind::Eof {
        return p.err("unexpected token");
    }
    Ok(e)
}
