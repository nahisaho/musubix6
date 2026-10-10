use crate::env::Env;
use exprlang_syntax::ast::{Expr, Param};
use std::fmt;
use std::rc::Rc;

#[derive(Debug)]
pub struct Closure {
    pub params: Vec<Param>,
    pub body: Expr,
    pub env: Env,
}

#[derive(Debug, Clone)]
pub enum Value {
    Int(i64),
    Bool(bool),
    Closure(Rc<Closure>),
}

impl PartialEq for Value {
    fn eq(&self, other: &Value) -> bool {
        match (self, other) {
            (Value::Int(a), Value::Int(b)) => a == b,
            (Value::Bool(a), Value::Bool(b)) => a == b,
            (Value::Closure(a), Value::Closure(b)) => Rc::ptr_eq(a, b),
            _ => false,
        }
    }
}

/** @id CODE-EVAL-001 @implements REQ-EVAL-010 */
impl fmt::Display for Value {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Value::Int(n) => write!(f, "{}", n),
            Value::Bool(b) => write!(f, "{}", b),
            Value::Closure(c) => write!(f, "<fn/{}>", c.params.len()),
        }
    }
}
