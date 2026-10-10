use exprlang_eval::EvalError;
use exprlang_syntax::parser::ParseError;
use exprlang_syntax::span::Span;
use exprlang_types::TypeError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    Parse(ParseError),
    Type(TypeError),
    Eval(EvalError),
}

impl Error {
    pub fn span(&self) -> Span {
        match self {
            Error::Parse(e) => e.span,
            Error::Type(e) => e.span,
            Error::Eval(e) => e.span,
        }
    }

    pub fn message(&self) -> String {
        match self {
            Error::Parse(e) => e.message.clone(),
            Error::Type(e) => e.message(),
            Error::Eval(e) => e.message(),
        }
    }
}
