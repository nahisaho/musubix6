use crate::value::Value;
use std::rc::Rc;

#[derive(Debug, Clone, Default)]
pub struct Env {
    head: Option<Rc<Node>>,
}

#[derive(Debug)]
struct Node {
    name: String,
    value: Value,
    next: Option<Rc<Node>>,
}

impl Env {
    pub fn new() -> Self {
        Env { head: None }
    }

    pub fn bind(&self, name: &str, value: Value) -> Env {
        Env { head: Some(Rc::new(Node { name: name.to_string(), value, next: self.head.clone() })) }
    }

    pub fn lookup(&self, name: &str) -> Option<Value> {
        let mut cur = self.head.as_ref();
        while let Some(n) = cur {
            if n.name == name {
                return Some(n.value.clone());
            }
            cur = n.next.as_ref();
        }
        None
    }
}
