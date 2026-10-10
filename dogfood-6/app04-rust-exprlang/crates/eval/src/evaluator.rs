use crate::env::Env;
use crate::error::{EvalError, EvalErrorKind};
use crate::value::{Closure, Value};
use exprlang_syntax::ast::{BinOp, Expr, ExprKind, UnOp};
use exprlang_syntax::span::Span;
use std::rc::Rc;

pub const MAX_DEPTH: usize = 200;

fn fail<T>(kind: EvalErrorKind, span: Span) -> Result<T, EvalError> {
    Err(EvalError { kind, span })
}

fn as_int(v: Value, span: Span) -> Result<i64, EvalError> {
    match v {
        Value::Int(n) => Ok(n),
        _ => fail(EvalErrorKind::NotCallable, span),
    }
}

fn as_bool(v: Value, span: Span) -> Result<bool, EvalError> {
    match v {
        Value::Bool(b) => Ok(b),
        _ => fail(EvalErrorKind::NotCallable, span),
    }
}

/** @id CODE-EVAL-002 @implements REQ-EVAL-001 @implements REQ-EVAL-002 @implements REQ-EVAL-003 @implements REQ-EVAL-012 */
fn arith(op: BinOp, a: i64, b: i64, whole: Span, rhs: Span) -> Result<Value, EvalError> {
    let overflow = || EvalError { kind: EvalErrorKind::Overflow, span: whole };
    Ok(match op {
        BinOp::Add => Value::Int(a.checked_add(b).ok_or_else(overflow)?),
        BinOp::Sub => Value::Int(a.checked_sub(b).ok_or_else(overflow)?),
        BinOp::Mul => Value::Int(a.checked_mul(b).ok_or_else(overflow)?),
        BinOp::Div | BinOp::Rem if b == 0 => return fail(EvalErrorKind::DivZero, rhs),
        BinOp::Div => Value::Int(a.checked_div(b).ok_or_else(overflow)?),
        BinOp::Rem => Value::Int(a.checked_rem(b).ok_or_else(overflow)?),
        BinOp::Lt => Value::Bool(a < b),
        BinOp::Le => Value::Bool(a <= b),
        BinOp::Gt => Value::Bool(a > b),
        BinOp::Ge => Value::Bool(a >= b),
        BinOp::Eq => Value::Bool(a == b),
        BinOp::Ne => Value::Bool(a != b),
        BinOp::And | BinOp::Or => unreachable!(),
    })
}

/** @id CODE-EVAL-003 @implements REQ-EVAL-004 */
fn eval_binary(op: BinOp, l: &Expr, r: &Expr, whole: &Expr, env: &Env, depth: usize) -> Result<Value, EvalError> {
    if matches!(op, BinOp::And | BinOp::Or) {
        let lv = as_bool(eval_in(l, env, depth)?, l.span)?;
        if (op == BinOp::And && !lv) || (op == BinOp::Or && lv) {
            return Ok(Value::Bool(lv));
        }
        return Ok(Value::Bool(as_bool(eval_in(r, env, depth)?, r.span)?));
    }
    let lv = eval_in(l, env, depth)?;
    let rv = eval_in(r, env, depth)?;
    match (lv, rv) {
        (Value::Bool(a), Value::Bool(b)) if matches!(op, BinOp::Eq | BinOp::Ne) => {
            Ok(Value::Bool((a == b) == (op == BinOp::Eq)))
        }
        (a, b) => arith(op, as_int(a, l.span)?, as_int(b, r.span)?, whole.span, r.span),
    }
}

/** @id CODE-EVAL-004 @implements REQ-EVAL-008 @implements REQ-EVAL-009 @implements REQ-EVAL-007 */
fn eval_call(callee: &Expr, args: &[Expr], whole: &Expr, env: &Env, depth: usize) -> Result<Value, EvalError> {
    let Value::Closure(c) = eval_in(callee, env, depth)? else {
        return fail(EvalErrorKind::NotCallable, whole.span);
    };
    if c.params.len() != args.len() {
        return fail(EvalErrorKind::Arity { expected: c.params.len(), found: args.len() }, whole.span);
    }
    let mut vals = Vec::with_capacity(args.len());
    for a in args {
        vals.push(eval_in(a, env, depth)?);
    }
    if depth >= MAX_DEPTH {
        return fail(EvalErrorKind::StackOverflow, whole.span);
    }
    let mut inner = c.env.clone();
    for (p, v) in c.params.iter().zip(vals) {
        inner = inner.bind(&p.name, v);
    }
    eval_in(&c.body, &inner, depth + 1)
}

/** @id CODE-EVAL-005 @implements REQ-EVAL-005 @implements REQ-EVAL-006 */
fn eval_in(e: &Expr, env: &Env, depth: usize) -> Result<Value, EvalError> {
    match &e.kind {
        ExprKind::Int(n) => Ok(Value::Int(*n)),
        ExprKind::Bool(b) => Ok(Value::Bool(*b)),
        ExprKind::Var(name) => match env.lookup(name) {
            Some(v) => Ok(v),
            None => fail(EvalErrorKind::Unbound(name.clone()), e.span),
        },
        ExprKind::Unary(op, x) => {
            let v = eval_in(x, env, depth)?;
            match op {
                UnOp::Neg => match as_int(v, x.span)?.checked_neg() {
                    Some(n) => Ok(Value::Int(n)),
                    None => fail(EvalErrorKind::Overflow, e.span),
                },
                UnOp::Not => Ok(Value::Bool(!as_bool(v, x.span)?)),
            }
        }
        ExprKind::Binary(op, l, r) => eval_binary(*op, l, r, e, env, depth),
        ExprKind::If(c, a, b) => {
            if as_bool(eval_in(c, env, depth)?, c.span)? {
                eval_in(a, env, depth)
            } else {
                eval_in(b, env, depth)
            }
        }
        ExprKind::Let(name, v, body) => {
            let val = eval_in(v, env, depth)?;
            eval_in(body, &env.bind(name, val), depth)
        }
        ExprKind::Lambda(params, body) => Ok(Value::Closure(Rc::new(Closure {
            params: params.clone(),
            body: (**body).clone(),
            env: env.clone(),
        }))),
        ExprKind::Call(callee, args) => eval_call(callee, args, e, env, depth),
    }
}

pub fn eval(e: &Expr) -> Result<Value, EvalError> {
    eval_in(e, &Env::new(), 0)
}
