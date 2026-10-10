use rx_syntax::{Ast, ClassSet, Parsed};

const MAX_STATES: usize = 100_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum State {
    Class(ClassSet, usize),
    Split(usize, usize),
    Save(usize, usize),
    AssertStart(usize),
    AssertEnd(usize),
    Match,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Nfa {
    pub states: Vec<State>,
    pub start: usize,
    pub groups: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NfaError {
    TooBig,
}

struct Builder {
    states: Vec<State>,
}

impl Builder {
    fn push(&mut self, s: State) -> Result<usize, NfaError> {
        if self.states.len() >= MAX_STATES {
            return Err(NfaError::TooBig);
        }
        self.states.push(s);
        Ok(self.states.len() - 1)
    }

    /** @id CODE-NFA-003 @implements REQ-NFA-003 REQ-NFA-004 REQ-NFA-005 REQ-NFA-006 */
    fn build(&mut self, ast: &Ast, next: usize) -> Result<usize, NfaError> {
        match ast {
            Ast::Empty => Ok(next),
            Ast::Literal(c) => self.push(State::Class(ClassSet::from_ranges(vec![(*c as u32, *c as u32)]), next)),
            Ast::Any => self.push(State::Class(ClassSet::from_ranges(vec![(10, 10)]).negate(), next)),
            Ast::Class(set) => self.push(State::Class(set.clone(), next)),
            Ast::Start => self.push(State::AssertStart(next)),
            Ast::End => self.push(State::AssertEnd(next)),
            Ast::Concat(items) => {
                let mut cont = next;
                for item in items.iter().rev() {
                    cont = self.build(item, cont)?;
                }
                Ok(cont)
            }
            Ast::Alt(branches) => {
                let mut starts = Vec::with_capacity(branches.len());
                for b in branches {
                    starts.push(self.build(b, next)?);
                }
                let mut acc = *starts.last().unwrap();
                for &s in starts.iter().rev().skip(1) {
                    acc = self.push(State::Split(s, acc))?;
                }
                Ok(acc)
            }
            Ast::Group { index, node } => match index {
                None => self.build(node, next),
                Some(i) => {
                    let close = self.push(State::Save(2 * i + 1, next))?;
                    let body = self.build(node, close)?;
                    self.push(State::Save(2 * i, body))
                }
            },
            Ast::Repeat { node, min, max, .. } => self.build_repeat(node, *min, *max, next),
        }
    }

    /** @id CODE-NFA-006 @implements REQ-NFA-006 REQ-NFA-007 */
    fn build_repeat(&mut self, node: &Ast, min: u32, max: Option<u32>, next: usize) -> Result<usize, NfaError> {
        let mut cont = next;
        match max {
            None => {
                let split = self.push(State::Split(0, next))?;
                let body = self.build(node, split)?;
                self.states[split] = State::Split(body, next);
                cont = if min == 0 { split } else { body };
                for _ in 1..min {
                    cont = self.build(node, cont)?;
                }
            }
            Some(max) => {
                for _ in min..max {
                    let body = self.build(node, cont)?;
                    cont = self.push(State::Split(body, next))?;
                }
                for _ in 0..min {
                    cont = self.build(node, cont)?;
                }
            }
        }
        Ok(cont)
    }
}

impl Nfa {
    /** @id CODE-NFA-001 @implements REQ-NFA-001 REQ-NFA-002 REQ-NFA-011 */
    pub fn from_parsed(p: &Parsed) -> Result<Nfa, NfaError> {
        Nfa::from_ast(&p.ast, p.groups)
    }

    pub fn from_ast(ast: &Ast, groups: usize) -> Result<Nfa, NfaError> {
        let mut b = Builder { states: vec![State::Match] };
        let start = b.build(ast, 0)?;
        Ok(Nfa { states: b.states, start, groups })
    }

    /** @id CODE-NFA-008 @implements REQ-NFA-008 REQ-NFA-009 */
    pub fn eps_closure(&self, seeds: &[usize], at_start: bool, at_end: bool) -> Vec<usize> {
        let mut seen = vec![false; self.states.len()];
        let mut stack: Vec<usize> = seeds.to_vec();
        while let Some(s) = stack.pop() {
            if std::mem::replace(&mut seen[s], true) {
                continue;
            }
            match &self.states[s] {
                State::Split(a, b) => {
                    stack.push(*a);
                    stack.push(*b);
                }
                State::Save(_, n) => stack.push(*n),
                State::AssertStart(n) if at_start => stack.push(*n),
                State::AssertEnd(n) if at_end => stack.push(*n),
                _ => {}
            }
        }
        (0..seen.len()).filter(|&i| seen[i]).collect()
    }

    /** @id CODE-NFA-012 @implements REQ-NFA-012 */
    pub fn is_match(&self, input: &str) -> bool {
        let chars: Vec<char> = input.chars().collect();
        let mut cur = self.eps_closure(&[self.start], true, chars.is_empty());
        for (i, &c) in chars.iter().enumerate() {
            let mut seeds = Vec::new();
            for &s in &cur {
                if let State::Class(set, n) = &self.states[s] {
                    if set.contains(c) {
                        seeds.push(*n);
                    }
                }
            }
            cur = self.eps_closure(&seeds, false, i + 1 == chars.len());
            if cur.is_empty() {
                return false;
            }
        }
        cur.iter().any(|&s| matches!(self.states[s], State::Match))
    }

    /** @id CODE-NFA-010 @implements REQ-NFA-010 */
    pub fn validate(&self) -> Result<(), String> {
        let n = self.states.len();
        let mut matches = 0;
        for (i, s) in self.states.iter().enumerate() {
            let targets: Vec<usize> = match s {
                State::Class(_, a) | State::Save(_, a) | State::AssertStart(a) | State::AssertEnd(a) => vec![*a],
                State::Split(a, b) => vec![*a, *b],
                State::Match => {
                    matches += 1;
                    vec![]
                }
            };
            if let Some(t) = targets.iter().find(|&&t| t >= n) {
                return Err(format!("state {i} targets {t} >= {n}"));
            }
        }
        if self.start >= n {
            return Err("start out of range".into());
        }
        if matches != 1 {
            return Err(format!("{matches} match states"));
        }
        Ok(())
    }
}
