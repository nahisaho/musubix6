use exprlang_syntax::ast::Ty;
use std::rc::Rc;

#[derive(Debug, Clone, Default)]
pub struct TypeEnv {
    head: Option<Rc<Node>>,
}

#[derive(Debug)]
struct Node {
    name: String,
    ty: Ty,
    next: Option<Rc<Node>>,
}

impl TypeEnv {
    pub fn new() -> Self {
        TypeEnv { head: None }
    }

    pub fn bind(&self, name: &str, ty: Ty) -> TypeEnv {
        TypeEnv { head: Some(Rc::new(Node { name: name.to_string(), ty, next: self.head.clone() })) }
    }

    pub fn lookup(&self, name: &str) -> Option<Ty> {
        let mut cur = self.head.as_ref();
        while let Some(n) = cur {
            if n.name == name {
                return Some(n.ty.clone());
            }
            cur = n.next.as_ref();
        }
        None
    }
}
