//! Regex syntax: AST and parser.

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ClassSet {
    ranges: Vec<(u32, u32)>,
}

const MAX_CP: u32 = 0x10FFFF;
const MAX_REPEAT: u64 = 1000;
const MAX_DEPTH: usize = 200;

impl ClassSet {
    /** @id CODE-PARSE-007 @implements REQ-PARSE-007 */
    pub fn from_ranges(mut ranges: Vec<(u32, u32)>) -> Self {
        ranges.sort_unstable();
        let mut out: Vec<(u32, u32)> = Vec::with_capacity(ranges.len());
        for (lo, hi) in ranges {
            match out.last_mut() {
                Some(last) if lo <= last.1.saturating_add(1) => last.1 = last.1.max(hi),
                _ => out.push((lo, hi)),
            }
        }
        ClassSet { ranges: out }
    }
    pub fn ranges(&self) -> &[(u32, u32)] {
        &self.ranges
    }
    pub fn negate(&self) -> ClassSet {
        let mut out = Vec::new();
        let mut next = 0u32;
        for &(lo, hi) in &self.ranges {
            if lo > next {
                out.push((next, lo - 1));
            }
            next = hi + 1;
        }
        if next <= MAX_CP {
            out.push((next, MAX_CP));
        }
        ClassSet { ranges: out }
    }
    pub fn contains(&self, c: char) -> bool {
        let c = c as u32;
        self.ranges
            .binary_search_by(|&(lo, hi)| {
                if c < lo {
                    std::cmp::Ordering::Greater
                } else if c > hi {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Equal
                }
            })
            .is_ok()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Ast {
    Empty,
    Literal(char),
    Any,
    Class(ClassSet),
    Concat(Vec<Ast>),
    Alt(Vec<Ast>),
    Repeat { node: Box<Ast>, min: u32, max: Option<u32>, greedy: bool },
    Group { index: Option<usize>, node: Box<Ast> },
    Start,
    End,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorKind {
    UnmatchedClose,
    UnclosedGroup,
    NothingToRepeat,
    DoubleRepeat,
    BadRange,
    BadRepeat,
    RepeatTooBig,
    TrailingBackslash,
    UnclosedClass,
    TooDeep,
    BadEscape,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    pub kind: ErrorKind,
    pub pos: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Parsed {
    pub ast: Ast,
    pub groups: usize,
}

struct Parser {
    chars: Vec<char>,
    pos: usize,
    depth: usize,
    groups: usize,
}

fn err<T>(kind: ErrorKind, pos: usize) -> Result<T, ParseError> {
    Err(ParseError { kind, pos })
}

/** @id CODE-PARSE-001 @implements REQ-PARSE-001 */
fn concat(mut items: Vec<Ast>) -> Ast {
    match items.len() {
        0 => Ast::Empty,
        1 => items.pop().unwrap(),
        _ => Ast::Concat(items),
    }
}

fn digit_class() -> ClassSet {
    ClassSet::from_ranges(vec![(48, 57)])
}
fn word_class() -> ClassSet {
    ClassSet::from_ranges(vec![(48, 57), (65, 90), (95, 95), (97, 122)])
}
fn space_class() -> ClassSet {
    ClassSet::from_ranges(vec![(9, 13), (32, 32)])
}

impl Parser {
    fn peek(&self) -> Option<char> {
        self.chars.get(self.pos).copied()
    }

    /** @id CODE-PARSE-002 @implements REQ-PARSE-002 */
    fn parse_alt(&mut self) -> Result<Ast, ParseError> {
        let mut branches = vec![self.parse_concat()?];
        while self.peek() == Some('|') {
            self.pos += 1;
            branches.push(self.parse_concat()?);
        }
        Ok(if branches.len() == 1 { branches.pop().unwrap() } else { Ast::Alt(branches) })
    }

    fn parse_concat(&mut self) -> Result<Ast, ParseError> {
        let mut items = Vec::new();
        while let Some(c) = self.peek() {
            if c == '|' || c == ')' {
                break;
            }
            let atom = self.parse_atom()?;
            items.push(self.parse_quantifiers(atom)?);
        }
        Ok(concat(items))
    }

    /** @id CODE-PARSE-003 @implements REQ-PARSE-003 REQ-PARSE-005 */
    fn parse_quantifiers(&mut self, atom: Ast) -> Result<Ast, ParseError> {
        let (min, max) = match self.peek() {
            Some('*') => (0, None),
            Some('+') => (1, None),
            Some('?') => (0, Some(1)),
            Some('{') => return self.parse_counted(atom),
            _ => return Ok(atom),
        };
        self.pos += 1;
        self.finish_repeat(atom, min, max)
    }

    /** @id CODE-PARSE-005 @implements REQ-PARSE-005 */
    fn finish_repeat(&mut self, atom: Ast, min: u32, max: Option<u32>) -> Result<Ast, ParseError> {
        let greedy = if self.peek() == Some('?') {
            self.pos += 1;
            false
        } else {
            true
        };
        if matches!(self.peek(), Some('*' | '+' | '?' | '{')) {
            return err(ErrorKind::DoubleRepeat, self.pos);
        }
        Ok(Ast::Repeat { node: Box::new(atom), min, max, greedy })
    }

    fn number(&mut self) -> Option<u64> {
        let start = self.pos;
        let mut n: u64 = 0;
        while let Some(d) = self.peek().and_then(|c| c.to_digit(10)) {
            n = (n * 10 + d as u64).min(MAX_REPEAT + 1);
            self.pos += 1;
        }
        (self.pos > start).then_some(n)
    }

    /** @id CODE-PARSE-004 @implements REQ-PARSE-004 */
    fn parse_counted(&mut self, atom: Ast) -> Result<Ast, ParseError> {
        let open = self.pos;
        self.pos += 1;
        let Some(lo) = self.number() else { return err(ErrorKind::BadRepeat, open) };
        let hi = if self.peek() == Some(',') {
            self.pos += 1;
            self.number()
        } else {
            Some(lo)
        };
        if self.peek() != Some('}') {
            return err(ErrorKind::BadRepeat, open);
        }
        self.pos += 1;
        if lo > MAX_REPEAT || hi.is_some_and(|h| h > MAX_REPEAT) {
            return err(ErrorKind::RepeatTooBig, open);
        }
        if hi.is_some_and(|h| lo > h) {
            return err(ErrorKind::BadRepeat, open);
        }
        self.finish_repeat(atom, lo as u32, hi.map(|h| h as u32))
    }

    /** @id CODE-PARSE-009 @implements REQ-PARSE-009 REQ-PARSE-010 */
    fn parse_atom(&mut self) -> Result<Ast, ParseError> {
        let at = self.pos;
        let c = self.chars[at];
        match c {
            '*' | '+' | '?' | '{' => err(ErrorKind::NothingToRepeat, at),
            '.' => {
                self.pos += 1;
                Ok(Ast::Any)
            }
            '^' => {
                self.pos += 1;
                Ok(Ast::Start)
            }
            '$' => {
                self.pos += 1;
                Ok(Ast::End)
            }
            '(' => self.parse_group(),
            '[' => self.parse_class(),
            '\\' => {
                let set = self.parse_escape()?;
                Ok(match set {
                    Esc::Char(c) => Ast::Literal(c),
                    Esc::Set(s) => Ast::Class(s),
                })
            }
            _ => {
                self.pos += 1;
                Ok(Ast::Literal(c))
            }
        }
    }

    /** @id CODE-PARSE-006 @implements REQ-PARSE-006 REQ-PARSE-011 */
    fn parse_group(&mut self) -> Result<Ast, ParseError> {
        let open = self.pos;
        self.pos += 1;
        self.depth += 1;
        if self.depth > MAX_DEPTH {
            return err(ErrorKind::TooDeep, open);
        }
        let index = if self.peek() == Some('?') && self.chars.get(self.pos + 1) == Some(&':') {
            self.pos += 2;
            None
        } else {
            self.groups += 1;
            Some(self.groups)
        };
        let node = self.parse_alt()?;
        if self.peek() != Some(')') {
            return err(ErrorKind::UnclosedGroup, open);
        }
        self.pos += 1;
        self.depth -= 1;
        Ok(Ast::Group { index, node: Box::new(node) })
    }

    /** @id CODE-PARSE-008 @implements REQ-PARSE-008 */
    fn parse_escape(&mut self) -> Result<Esc, ParseError> {
        let at = self.pos;
        self.pos += 1;
        let Some(c) = self.peek() else { return err(ErrorKind::TrailingBackslash, at) };
        self.pos += 1;
        Ok(match c {
            'd' => Esc::Set(digit_class()),
            'D' => Esc::Set(digit_class().negate()),
            'w' => Esc::Set(word_class()),
            'W' => Esc::Set(word_class().negate()),
            's' => Esc::Set(space_class()),
            'S' => Esc::Set(space_class().negate()),
            'n' => Esc::Char('\n'),
            't' => Esc::Char('\t'),
            'r' => Esc::Char('\r'),
            c if c.is_ascii_alphanumeric() => return err(ErrorKind::BadEscape, at),
            c => Esc::Char(c),
        })
    }

    fn class_item(&mut self) -> Result<Esc, ParseError> {
        if self.peek() == Some('\\') {
            self.parse_escape()
        } else {
            let c = self.chars[self.pos];
            self.pos += 1;
            Ok(Esc::Char(c))
        }
    }

    fn parse_class(&mut self) -> Result<Ast, ParseError> {
        let open = self.pos;
        self.pos += 1;
        let negated = self.peek() == Some('^');
        if negated {
            self.pos += 1;
        }
        let mut ranges: Vec<(u32, u32)> = Vec::new();
        let mut first = true;
        loop {
            match self.peek() {
                None => return err(ErrorKind::UnclosedClass, open),
                Some(']') if !first => {
                    self.pos += 1;
                    break;
                }
                _ => {}
            }
            first = false;
            let start_pos = self.pos;
            match self.class_item()? {
                Esc::Set(s) => ranges.extend_from_slice(s.ranges()),
                Esc::Char(lo) => {
                    let is_range = self.peek() == Some('-')
                        && self.chars.get(self.pos + 1).is_some_and(|&c| c != ']');
                    if is_range {
                        self.pos += 1;
                        let hi = match self.class_item()? {
                            Esc::Char(h) => h,
                            Esc::Set(_) => return err(ErrorKind::BadRange, start_pos),
                        };
                        if hi < lo {
                            return err(ErrorKind::BadRange, start_pos);
                        }
                        ranges.push((lo as u32, hi as u32));
                    } else {
                        ranges.push((lo as u32, lo as u32));
                    }
                }
            }
        }
        let set = ClassSet::from_ranges(ranges);
        Ok(Ast::Class(if negated { set.negate() } else { set }))
    }
}

enum Esc {
    Char(char),
    Set(ClassSet),
}

pub fn parse(pattern: &str) -> Result<Parsed, ParseError> {
    let mut p = Parser { chars: pattern.chars().collect(), pos: 0, depth: 0, groups: 0 };
    let ast = p.parse_alt()?;
    if p.pos < p.chars.len() {
        return err(ErrorKind::UnmatchedClose, p.pos);
    }
    Ok(Parsed { ast, groups: p.groups })
}

fn esc_char(c: char) -> String {
    match c {
        '\n' => "\\n".into(),
        '\t' => "\\t".into(),
        '\r' => "\\r".into(),
        c if c.is_ascii_punctuation() => format!("\\{c}"),
        c => c.to_string(),
    }
}

impl Ast {
    /** @id CODE-PARSE-012 @implements REQ-PARSE-012 */
    pub fn to_pattern(&self) -> String {
        match self {
            Ast::Empty => String::new(),
            Ast::Literal(c) => esc_char(*c),
            Ast::Any => ".".into(),
            Ast::Start => "^".into(),
            Ast::End => "$".into(),
            Ast::Class(s) => {
                let mut out = String::from("[");
                for &(lo, hi) in s.ranges() {
                    let (a, b) = (char::from_u32(lo), char::from_u32(hi));
                    let (Some(a), Some(b)) = (a, b) else { continue };
                    out.push_str(&esc_char(a));
                    if a != b {
                        out.push('-');
                        out.push_str(&esc_char(b));
                    }
                }
                out.push(']');
                out
            }
            Ast::Concat(v) => v.iter().map(|a| a.wrapped(matches!(a, Ast::Alt(_)))).collect(),
            Ast::Alt(v) => v.iter().map(|a| a.to_pattern()).collect::<Vec<_>>().join("|"),
            Ast::Group { index, node } => {
                let open = if index.is_some() { "(" } else { "(?:" };
                format!("{open}{})", node.to_pattern())
            }
            Ast::Repeat { node, min, max, greedy } => {
                let atomic = matches!(**node, Ast::Concat(_) | Ast::Alt(_) | Ast::Repeat { .. } | Ast::Empty);
                let q = match (min, max) {
                    (0, None) => "*".to_string(),
                    (1, None) => "+".to_string(),
                    (0, Some(1)) => "?".to_string(),
                    (n, None) => format!("{{{n},}}"),
                    (n, Some(m)) if n == m => format!("{{{n}}}"),
                    (n, Some(m)) => format!("{{{n},{m}}}"),
                };
                format!("{}{q}{}", node.wrapped(atomic), if *greedy { "" } else { "?" })
            }
        }
    }

    fn wrapped(&self, wrap: bool) -> String {
        if wrap {
            format!("(?:{})", self.to_pattern())
        } else {
            self.to_pattern()
        }
    }
}
