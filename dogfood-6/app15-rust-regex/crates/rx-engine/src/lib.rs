use rx_dfa::Dfa;
use rx_nfa::Nfa;
use rx_syntax::{parse, ParseError};
use rx_vm::{compile, CompileError, Program};
use std::ops::Range;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    Parse(ParseError),
    Compile(CompileError),
    Unsupported,
}

#[derive(Debug, Clone)]
pub struct Regex {
    pattern: String,
    prog: Program,
    nfa: Nfa,
    dfa: Option<Dfa>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Match<'t> {
    text: &'t str,
    start: usize,
    end: usize,
}

impl<'t> Match<'t> {
    pub fn start(&self) -> usize {
        self.start
    }
    pub fn end(&self) -> usize {
        self.end
    }
    pub fn range(&self) -> Range<usize> {
        self.start..self.end
    }
    pub fn as_str(&self) -> &'t str {
        &self.text[self.start..self.end]
    }
}

#[derive(Debug, Clone)]
pub struct Captures<'t> {
    text: &'t str,
    slots: Vec<Option<usize>>,
}

impl<'t> Captures<'t> {
    /** @id CODE-ENGINE-005 @implements REQ-ENGINE-005 */
    pub fn len(&self) -> usize {
        self.slots.len() / 2
    }
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
    pub fn get(&self, i: usize) -> Option<Match<'t>> {
        let start = (*self.slots.get(2 * i)?)?;
        let end = (*self.slots.get(2 * i + 1)?)?;
        Some(Match { text: self.text, start, end })
    }
}

fn next_char_boundary(text: &str, at: usize) -> usize {
    text[at..].chars().next().map_or(at + 1, |c| at + c.len_utf8())
}

impl Regex {
    /** @id CODE-ENGINE-001 @implements REQ-ENGINE-001 REQ-ENGINE-011 */
    pub fn new(pattern: &str) -> Result<Regex, Error> {
        let parsed = parse(pattern).map_err(Error::Parse)?;
        let prog = compile(&parsed).map_err(Error::Compile)?;
        let nfa = Nfa::from_parsed(&parsed).map_err(|_| Error::Compile(CompileError::TooBig))?;
        let dfa = Dfa::from_nfa(&nfa).ok().map(|d| d.minimize());
        Ok(Regex { pattern: pattern.to_string(), prog, nfa, dfa })
    }
    pub fn pattern(&self) -> &str {
        &self.pattern
    }
    pub fn group_count(&self) -> usize {
        self.prog.groups
    }

    /** @id CODE-ENGINE-004 @implements REQ-ENGINE-003 REQ-ENGINE-004 */
    pub fn uses_dfa(&self) -> bool {
        self.dfa.is_some()
    }
    pub fn is_match(&self, text: &str) -> bool {
        self.prog.find_at(text, 0).is_some()
    }
    pub fn full_match(&self, text: &str) -> bool {
        match &self.dfa {
            Some(d) => d.is_match(text),
            None => self.full_match_nfa(text),
        }
    }
    pub fn full_match_nfa(&self, text: &str) -> bool {
        self.nfa.is_match(text)
    }

    /** @id CODE-ENGINE-002 @implements REQ-ENGINE-002 */
    pub fn find<'t>(&self, text: &'t str) -> Option<Match<'t>> {
        let slots = self.prog.find_at(text, 0)?;
        Some(Match { text, start: slots[0]?, end: slots[1]? })
    }
    pub fn captures<'t>(&self, text: &'t str) -> Option<Captures<'t>> {
        let slots = self.prog.find_at(text, 0)?;
        Some(Captures { text, slots })
    }

    /** @id CODE-ENGINE-006 @implements REQ-ENGINE-006 REQ-ENGINE-010 REQ-ENGINE-013 */
    fn all_slots(&self, text: &str) -> Vec<Vec<Option<usize>>> {
        let mut out = Vec::new();
        let mut pos = 0;
        let mut last_end: Option<usize> = None;
        while pos <= text.len() {
            let Some(slots) = self.prog.find_at(text, pos) else { break };
            let (s, e) = (slots[0].unwrap(), slots[1].unwrap());
            if s == e && last_end == Some(e) {
                pos = next_char_boundary(text, e);
                continue;
            }
            last_end = Some(e);
            pos = if s == e { next_char_boundary(text, e) } else { e };
            out.push(slots);
        }
        out
    }
    pub fn find_all<'t>(&self, text: &'t str) -> Vec<Match<'t>> {
        self.all_slots(text)
            .into_iter()
            .map(|s| Match { text, start: s[0].unwrap(), end: s[1].unwrap() })
            .collect()
    }
    pub fn captures_all<'t>(&self, text: &'t str) -> Vec<Captures<'t>> {
        self.all_slots(text).into_iter().map(|slots| Captures { text, slots }).collect()
    }

    /** @id CODE-ENGINE-007 @implements REQ-ENGINE-007 REQ-ENGINE-008 REQ-ENGINE-014 */
    pub fn replace_all(&self, text: &str, template: &str) -> String {
        let mut out = String::new();
        let mut last = 0;
        for slots in self.all_slots(text) {
            let (s, e) = (slots[0].unwrap(), slots[1].unwrap());
            out.push_str(&text[last..s]);
            expand(template, &Captures { text, slots }, &mut out);
            last = e;
        }
        out.push_str(&text[last..]);
        out
    }

    /** @id CODE-ENGINE-009 @implements REQ-ENGINE-009 */
    pub fn split<'t>(&self, text: &'t str) -> Vec<&'t str> {
        let mut out = Vec::new();
        let mut last = 0;
        for m in self.find_all(text) {
            out.push(&text[last..m.start()]);
            last = m.end();
        }
        out.push(&text[last..]);
        out
    }

    /** @id CODE-ENGINE-012 @implements REQ-ENGINE-012 */
    pub fn equivalent_to(&self, other: &Regex) -> Result<bool, Error> {
        match (&self.dfa, &other.dfa) {
            (Some(a), Some(b)) => Ok(a.equivalent(b)),
            _ => Err(Error::Unsupported),
        }
    }
}

fn expand(template: &str, caps: &Captures<'_>, out: &mut String) {
    let chars: Vec<char> = template.chars().collect();
    let mut i = 0;
    let group = |n: usize, out: &mut String| {
        if let Some(m) = caps.get(n) {
            out.push_str(m.as_str());
        }
    };
    while i < chars.len() {
        if chars[i] != '$' {
            out.push(chars[i]);
            i += 1;
            continue;
        }
        match chars.get(i + 1) {
            Some('$') => {
                out.push('$');
                i += 2;
            }
            Some(d) if d.is_ascii_digit() => {
                let mut j = i + 1;
                while j < chars.len() && chars[j].is_ascii_digit() {
                    j += 1;
                }
                let n: String = chars[i + 1..j].iter().collect();
                group(n.parse().unwrap_or(usize::MAX), out);
                i = j;
            }
            Some('{') => match chars[i + 2..].iter().position(|&c| c == '}') {
                Some(end) if end > 0 && chars[i + 2..i + 2 + end].iter().all(|c| c.is_ascii_digit()) => {
                    let n: String = chars[i + 2..i + 2 + end].iter().collect();
                    group(n.parse().unwrap_or(usize::MAX), out);
                    i += end + 3;
                }
                _ => {
                    out.push('$');
                    i += 1;
                }
            },
            _ => {
                out.push('$');
                i += 1;
            }
        }
    }
}
