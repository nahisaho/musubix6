use exprlang_syntax::span::Span;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EvalErrorKind {
    Overflow,
    DivZero,
    Unbound(String),
    NotCallable,
    Arity { expected: usize, found: usize },
    StackOverflow,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EvalError {
    pub kind: EvalErrorKind,
    pub span: Span,
}

impl EvalError {
    pub fn message(&self) -> String {
        match &self.kind {
            EvalErrorKind::Overflow => "integer overflow".to_string(),
            EvalErrorKind::DivZero => "division by zero".to_string(),
            EvalErrorKind::Unbound(n) => format!("unbound variable '{}'", n),
            EvalErrorKind::NotCallable => "value is not callable".to_string(),
            EvalErrorKind::Arity { expected, found } => {
                format!("expected {} argument(s), found {}", expected, found)
            }
            EvalErrorKind::StackOverflow => "call depth limit exceeded".to_string(),
        }
    }
}
