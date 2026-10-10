use crate::env::TypeEnv;
use crate::error::{TypeError, TypeErrorKind};
use exprlang_syntax::ast::{BinOp, Expr, ExprKind, Ty, UnOp};

fn mismatch(expected: &Ty, found: Ty, e: &Expr) -> TypeError {
    TypeError { kind: TypeErrorKind::Mismatch { expected: expected.clone(), found }, span: e.span }
}

fn expect(e: &Expr, env: &TypeEnv, expected: &Ty) -> Result<(), TypeError> {
    let found = check_in(e, env)?;
    if &found == expected {
        Ok(())
    } else {
        Err(mismatch(expected, found, e))
    }
}

/** @id CODE-TYPE-001 @implements REQ-TYPE-001 @implements REQ-TYPE-002 @implements REQ-TYPE-003 @implements REQ-TYPE-008 */
fn check_binary(op: BinOp, l: &Expr, r: &Expr, whole: &Expr, env: &TypeEnv) -> Result<Ty, TypeError> {
    match op {
        BinOp::Add | BinOp::Sub | BinOp::Mul | BinOp::Div | BinOp::Rem => {
            expect(l, env, &Ty::Int)?;
            expect(r, env, &Ty::Int)?;
            Ok(Ty::Int)
        }
        BinOp::Lt | BinOp::Le | BinOp::Gt | BinOp::Ge => {
            expect(l, env, &Ty::Int)?;
            expect(r, env, &Ty::Int)?;
            Ok(Ty::Bool)
        }
        BinOp::And | BinOp::Or => {
            expect(l, env, &Ty::Bool)?;
            expect(r, env, &Ty::Bool)?;
            Ok(Ty::Bool)
        }
        BinOp::Eq | BinOp::Ne => {
            let lt = check_in(l, env)?;
            let rt = check_in(r, env)?;
            if matches!(lt, Ty::Fn(..)) {
                return Err(TypeError { kind: TypeErrorKind::NotComparable(lt), span: whole.span });
            }
            if lt != rt {
                return Err(mismatch(&lt, rt, r));
            }
            Ok(Ty::Bool)
        }
    }
}

/** @id CODE-TYPE-002 @implements REQ-TYPE-007 */
fn check_call(callee: &Expr, args: &[Expr], whole: &Expr, env: &TypeEnv) -> Result<Ty, TypeError> {
    let ct = check_in(callee, env)?;
    let Ty::Fn(params, ret) = ct else {
        return Err(TypeError { kind: TypeErrorKind::NotCallable(ct), span: callee.span });
    };
    if params.len() != args.len() {
        return Err(TypeError {
            kind: TypeErrorKind::Arity { expected: params.len(), found: args.len() },
            span: whole.span,
        });
    }
    for (p, a) in params.iter().zip(args) {
        expect(a, env, p)?;
    }
    Ok(*ret)
}

/** @id CODE-TYPE-003 @implements REQ-TYPE-004 @implements REQ-TYPE-005 @implements REQ-TYPE-006 */
pub fn check_in(e: &Expr, env: &TypeEnv) -> Result<Ty, TypeError> {
    match &e.kind {
        ExprKind::Int(_) => Ok(Ty::Int),
        ExprKind::Bool(_) => Ok(Ty::Bool),
        ExprKind::Var(name) => env.lookup(name).ok_or_else(|| TypeError {
            kind: TypeErrorKind::UnboundVar(name.clone()),
            span: e.span,
        }),
        ExprKind::Unary(op, x) => {
            let t = if *op == UnOp::Neg { Ty::Int } else { Ty::Bool };
            expect(x, env, &t)?;
            Ok(t)
        }
        ExprKind::Binary(op, l, r) => check_binary(*op, l, r, e, env),
        ExprKind::If(c, a, b) => {
            expect(c, env, &Ty::Bool)?;
            let t = check_in(a, env)?;
            expect(b, env, &t)?;
            Ok(t)
        }
        ExprKind::Let(name, v, body) => {
            let vt = check_in(v, env)?;
            check_in(body, &env.bind(name, vt))
        }
        ExprKind::Lambda(params, body) => {
            let mut inner = env.clone();
            for p in params {
                inner = inner.bind(&p.name, p.ty.clone());
            }
            let ret = check_in(body, &inner)?;
            Ok(Ty::Fn(params.iter().map(|p| p.ty.clone()).collect(), Box::new(ret)))
        }
        ExprKind::Call(callee, args) => check_call(callee, args, e, env),
    }
}

pub fn check(e: &Expr) -> Result<Ty, TypeError> {
    check_in(e, &TypeEnv::new())
}
