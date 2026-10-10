use rx_syntax::{Ast, ClassSet, Parsed};

const MAX_INSTS: usize = 100_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Inst {
    Char(char),
    Any,
    Class(ClassSet),
    Split(usize, usize),
    Jmp(usize),
    Save(usize),
    AssertStart,
    AssertEnd,
    Match,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Program {
    pub insts: Vec<Inst>,
    pub groups: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompileError {
    TooBig,
}

pub type Slots = Vec<Option<usize>>;

struct Emitter {
    insts: Vec<Inst>,
}

impl Emitter {
    fn push(&mut self, i: Inst) -> Result<usize, CompileError> {
        if self.insts.len() >= MAX_INSTS {
            return Err(CompileError::TooBig);
        }
        self.insts.push(i);
        Ok(self.insts.len() - 1)
    }

    /** @id CODE-VM-001 @implements REQ-VM-001 REQ-VM-002 REQ-VM-005 REQ-VM-012 */
    fn emit(&mut self, ast: &Ast) -> Result<(), CompileError> {
        match ast {
            Ast::Empty => {}
            Ast::Literal(c) => {
                self.push(Inst::Char(*c))?;
            }
            Ast::Any => {
                self.push(Inst::Any)?;
            }
            Ast::Class(set) => {
                self.push(Inst::Class(set.clone()))?;
            }
            Ast::Start => {
                self.push(Inst::AssertStart)?;
            }
            Ast::End => {
                self.push(Inst::AssertEnd)?;
            }
            Ast::Concat(items) => {
                for item in items {
                    self.emit(item)?;
                }
            }
            Ast::Alt(branches) => {
                let mut jumps = Vec::new();
                for (i, b) in branches.iter().enumerate() {
                    if i + 1 < branches.len() {
                        let split = self.push(Inst::Split(0, 0))?;
                        self.emit(b)?;
                        jumps.push(self.push(Inst::Jmp(0))?);
                        self.insts[split] = Inst::Split(split + 1, self.insts.len());
                    } else {
                        self.emit(b)?;
                    }
                }
                let end = self.insts.len();
                for j in jumps {
                    self.insts[j] = Inst::Jmp(end);
                }
            }
            Ast::Group { index, node } => match index {
                None => self.emit(node)?,
                Some(i) => {
                    self.push(Inst::Save(2 * i))?;
                    self.emit(node)?;
                    self.push(Inst::Save(2 * i + 1))?;
                }
            },
            Ast::Repeat { node, min, max, greedy } => self.emit_repeat(node, *min, *max, *greedy)?,
        }
        Ok(())
    }

    /** @id CODE-VM-003 @implements REQ-VM-003 REQ-VM-004 REQ-VM-011 */
    fn emit_repeat(&mut self, node: &Ast, min: u32, max: Option<u32>, greedy: bool) -> Result<(), CompileError> {
        for _ in 0..min {
            self.emit(node)?;
        }
        let order = |body: usize, end: usize| if greedy { Inst::Split(body, end) } else { Inst::Split(end, body) };
        match max {
            None => {
                let split = self.push(Inst::Split(0, 0))?;
                self.emit(node)?;
                self.push(Inst::Jmp(split))?;
                self.insts[split] = order(split + 1, self.insts.len());
            }
            Some(max) => {
                let mut splits = Vec::new();
                for _ in min..max {
                    splits.push(self.push(Inst::Split(0, 0))?);
                    self.emit(node)?;
                }
                let end = self.insts.len();
                for s in splits {
                    self.insts[s] = order(s + 1, end);
                }
            }
        }
        Ok(())
    }
}

pub fn compile(parsed: &Parsed) -> Result<Program, CompileError> {
    let mut e = Emitter { insts: Vec::new() };
    e.emit(&parsed.ast)?;
    e.push(Inst::Match)?;
    Ok(Program { insts: e.insts, groups: parsed.groups })
}

struct Threads {
    list: Vec<(usize, Slots)>,
    mark: Vec<usize>,
    gen: usize,
}

impl Threads {
    fn new(n: usize) -> Self {
        Threads { list: Vec::new(), mark: vec![0; n], gen: 1 }
    }
    fn clear(&mut self) {
        self.list.clear();
        self.gen += 1;
    }
}

enum Frame {
    Go(usize),
    Restore(usize, Option<usize>),
}

impl Program {
    /** @id CODE-VM-001B @implements REQ-VM-001 */
    pub fn disassemble(&self) -> String {
        let mut out = String::new();
        for (i, inst) in self.insts.iter().enumerate() {
            let text = match inst {
                Inst::Char(c) => format!("char {c:?}"),
                Inst::Any => "any".to_string(),
                Inst::Class(set) => {
                    let parts: Vec<String> = set
                        .ranges()
                        .iter()
                        .map(|&(a, b)| if a == b { a.to_string() } else { format!("{a}-{b}") })
                        .collect();
                    format!("class [{}]", parts.join(","))
                }
                Inst::Split(a, b) => format!("split {a}, {b}"),
                Inst::Jmp(t) => format!("jmp {t}"),
                Inst::Save(n) => format!("save {n}"),
                Inst::AssertStart => "bol".to_string(),
                Inst::AssertEnd => "eol".to_string(),
                Inst::Match => "match".to_string(),
            };
            out.push_str(&format!("{i:04} {text}\n"));
        }
        out
    }

    /** @id CODE-VM-008 @implements REQ-VM-008 REQ-VM-009 REQ-VM-010 */
    fn add_thread(&self, list: &mut Threads, pc: usize, cap: &mut Slots, pos: usize, len: usize) {
        let mut stack = vec![Frame::Go(pc)];
        while let Some(frame) = stack.pop() {
            let pc = match frame {
                Frame::Restore(slot, old) => {
                    cap[slot] = old;
                    continue;
                }
                Frame::Go(pc) => pc,
            };
            if list.mark[pc] == list.gen {
                continue;
            }
            list.mark[pc] = list.gen;
            match &self.insts[pc] {
                Inst::Jmp(t) => stack.push(Frame::Go(*t)),
                Inst::Split(x, y) => {
                    stack.push(Frame::Go(*y));
                    stack.push(Frame::Go(*x));
                }
                Inst::Save(n) => {
                    stack.push(Frame::Restore(*n, cap[*n]));
                    cap[*n] = Some(pos);
                    stack.push(Frame::Go(pc + 1));
                }
                Inst::AssertStart => {
                    if pos == 0 {
                        stack.push(Frame::Go(pc + 1));
                    }
                }
                Inst::AssertEnd => {
                    if pos == len {
                        stack.push(Frame::Go(pc + 1));
                    }
                }
                _ => list.list.push((pc, cap.clone())),
            }
        }
    }

    pub fn find_at(&self, input: &str, at: usize) -> Option<Slots> {
        self.find_at_stats(input, at).0
    }

    /** @id CODE-VM-006 @implements REQ-VM-006 REQ-VM-007 */
    pub fn find_at_stats(&self, input: &str, at: usize) -> (Option<Slots>, usize) {
        if at > input.len() || !input.is_char_boundary(at) {
            return (None, 0);
        }
        let nslots = 2 * (self.groups + 1);
        let n = self.insts.len();
        let (mut clist, mut nlist) = (Threads::new(n), Threads::new(n));
        let mut matched: Option<Slots> = None;
        let mut peak = 0;
        let mut pos = at;
        loop {
            if matched.is_none() {
                let mut cap = vec![None; nslots];
                cap[0] = Some(pos);
                self.add_thread(&mut clist, 0, &mut cap, pos, input.len());
            }
            peak = peak.max(clist.list.len());
            let ch = input[pos..].chars().next();
            let next_pos = pos + ch.map_or(0, char::len_utf8);
            nlist.clear();
            for (pc, slots) in &clist.list {
                let hit = match &self.insts[*pc] {
                    Inst::Match => {
                        let mut s = slots.clone();
                        s[1] = Some(pos);
                        matched = Some(s);
                        break;
                    }
                    Inst::Char(c) => ch == Some(*c),
                    Inst::Any => ch.is_some_and(|c| c != '\n'),
                    Inst::Class(set) => ch.is_some_and(|c| set.contains(c)),
                    _ => false,
                };
                if hit {
                    let mut cap = slots.clone();
                    self.add_thread(&mut nlist, pc + 1, &mut cap, next_pos, input.len());
                }
            }
            if ch.is_none() || (matched.is_some() && nlist.list.is_empty()) {
                break;
            }
            pos = next_pos;
            std::mem::swap(&mut clist, &mut nlist);
        }
        (matched, peak)
    }
}
