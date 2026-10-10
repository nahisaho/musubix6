use exprlang_syntax::ast::Ty;
use exprlang_syntax::span::Span;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TypeErrorKind {
    Mismatch { expected: Ty, found: Ty },
    UnboundVar(String),
    Arity { expected: usize, found: usize },
    NotCallable(Ty),
    NotComparable(Ty),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TypeError {
    pub kind: TypeErrorKind,
    pub span: Span,
}

impl TypeError {
    pub fn message(&self) -> String {
        match &self.kind {
            TypeErrorKind::Mismatch { expected, found } => {
                format!("type mismatch: expected {:?}, found {:?}", expected, found)
            }
            TypeErrorKind::UnboundVar(n) => format!("unbound variable '{}'", n),
            TypeErrorKind::Arity { expected, found } => {
                format!("expected {} argument(s), found {}", expected, found)
            }
            TypeErrorKind::NotCallable(t) => format!("cannot call a value of type {:?}", t),
            TypeErrorKind::NotComparable(t) => format!("cannot compare values of type {:?}", t),
        }
    }
}
