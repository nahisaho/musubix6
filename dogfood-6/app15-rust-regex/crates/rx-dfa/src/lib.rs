use rx_nfa::{Nfa, State};
use std::collections::{BTreeSet, HashMap, VecDeque};

const MAX_CP: u32 = 0x10FFFF;
const MAX_STATES: usize = 10_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Dfa {
    bounds: Vec<u32>,
    trans: Vec<usize>,
    accept: Vec<bool>,
    start: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DfaError {
    Unsupported,
    TooManyStates,
}

fn in_ranges(ranges: &[(u32, u32)], cp: u32) -> bool {
    ranges.iter().any(|&(lo, hi)| lo <= cp && cp <= hi)
}

impl Dfa {
    /** @id CODE-DFA-001 @implements REQ-DFA-001 REQ-DFA-002 REQ-DFA-003 REQ-DFA-004 REQ-DFA-005 */
    pub fn from_nfa(nfa: &Nfa) -> Result<Dfa, DfaError> {
        if nfa.states.iter().any(|s| matches!(s, State::AssertStart(_) | State::AssertEnd(_))) {
            return Err(DfaError::Unsupported);
        }
        let mut cuts: BTreeSet<u32> = BTreeSet::from([0]);
        for s in &nfa.states {
            if let State::Class(set, _) = s {
                for &(lo, hi) in set.ranges() {
                    cuts.insert(lo);
                    if hi < MAX_CP {
                        cuts.insert(hi + 1);
                    }
                }
            }
        }
        let bounds: Vec<u32> = cuts.into_iter().collect();
        let key = |seeds: &[usize]| -> Vec<usize> {
            nfa.eps_closure(seeds, false, false)
                .into_iter()
                .filter(|&i| matches!(nfa.states[i], State::Class(..) | State::Match))
                .collect()
        };
        let mut ids: HashMap<Vec<usize>, usize> = HashMap::new();
        let mut keys: Vec<Vec<usize>> = Vec::new();
        let first = key(&[nfa.start]);
        ids.insert(first.clone(), 0);
        keys.push(first);
        let mut trans = Vec::new();
        let mut i = 0;
        while i < keys.len() {
            let cur = keys[i].clone();
            for &rep in &bounds {
                let seeds: Vec<usize> = cur
                    .iter()
                    .filter_map(|&s| match &nfa.states[s] {
                        State::Class(set, n) if in_ranges(set.ranges(), rep) => Some(*n),
                        _ => None,
                    })
                    .collect();
                let k = key(&seeds);
                let next = match ids.get(&k) {
                    Some(&id) => id,
                    None => {
                        if keys.len() >= MAX_STATES {
                            return Err(DfaError::TooManyStates);
                        }
                        ids.insert(k.clone(), keys.len());
                        keys.push(k);
                        keys.len() - 1
                    }
                };
                trans.push(next);
            }
            i += 1;
        }
        let accept = keys.iter().map(|k| k.iter().any(|&s| matches!(nfa.states[s], State::Match))).collect();
        Ok(Dfa { bounds, trans, accept, start: 0 })
    }

    pub fn bounds(&self) -> &[u32] {
        &self.bounds
    }
    pub fn num_classes(&self) -> usize {
        self.bounds.len()
    }
    pub fn num_states(&self) -> usize {
        self.accept.len()
    }
    pub fn start(&self) -> usize {
        self.start
    }
    pub fn class_of(&self, c: char) -> usize {
        self.class_of_cp(c as u32)
    }
    fn class_of_cp(&self, cp: u32) -> usize {
        self.bounds.partition_point(|&b| b <= cp) - 1
    }
    pub fn next_state(&self, state: usize, class: usize) -> usize {
        self.trans[state * self.bounds.len() + class]
    }
    pub fn is_accepting(&self, state: usize) -> bool {
        self.accept[state]
    }

    /** @id CODE-DFA-011 @implements REQ-DFA-011 */
    pub fn is_match(&self, input: &str) -> bool {
        let mut s = self.start;
        for c in input.chars() {
            s = self.next_state(s, self.class_of(c));
        }
        self.accept[s]
    }

    /** @id CODE-DFA-006 @implements REQ-DFA-006 REQ-DFA-007 */
    pub fn minimize(&self) -> Dfa {
        let c = self.canonical();
        let (n, m) = (c.num_states(), c.num_classes());
        let mut inv: Vec<Vec<Vec<usize>>> = vec![vec![Vec::new(); n]; m];
        for s in 0..n {
            for k in 0..m {
                inv[k][c.next_state(s, k)].push(s);
            }
        }
        let mut blocks: Vec<Vec<usize>> = Vec::new();
        let mut block_of = vec![0; n];
        for want in [true, false] {
            let members: Vec<usize> = (0..n).filter(|&s| c.accept[s] == want).collect();
            if !members.is_empty() {
                for &s in &members {
                    block_of[s] = blocks.len();
                }
                blocks.push(members);
            }
        }
        let mut work: Vec<usize> = (0..blocks.len()).collect();
        let mut in_work = vec![true; blocks.len()];
        while let Some(a) = work.pop() {
            in_work[a] = false;
            let splitter = blocks[a].clone();
            for k in 0..m {
                let mut x: Vec<usize> = splitter.iter().flat_map(|&t| inv[k][t].iter().copied()).collect();
                x.sort_unstable();
                x.dedup();
                let mut touched: Vec<usize> = x.iter().map(|&s| block_of[s]).collect();
                touched.sort_unstable();
                touched.dedup();
                for y in touched {
                    let (inside, outside): (Vec<usize>, Vec<usize>) =
                        blocks[y].iter().partition(|s| x.binary_search(s).is_ok());
                    if outside.is_empty() {
                        continue;
                    }
                    let z = blocks.len();
                    let (keep, moved) = if inside.len() <= outside.len() { (outside, inside) } else { (inside, outside) };
                    for &s in &moved {
                        block_of[s] = z;
                    }
                    blocks[y] = keep;
                    blocks.push(moved);
                    in_work.push(false);
                    if in_work[y] {
                        in_work[z] = true;
                        work.push(z);
                    } else {
                        let smaller = if blocks[y].len() <= blocks[z].len() { y } else { z };
                        in_work[smaller] = true;
                        work.push(smaller);
                    }
                }
            }
        }
        let mut trans = Vec::with_capacity(blocks.len() * m);
        for b in &blocks {
            for k in 0..m {
                trans.push(block_of[c.next_state(b[0], k)]);
            }
        }
        let accept = blocks.iter().map(|b| c.accept[b[0]]).collect();
        Dfa { bounds: c.bounds.clone(), trans, accept, start: block_of[c.start] }.canonical()
    }

    /** @id CODE-DFA-008 @implements REQ-DFA-008 */
    fn canonical(&self) -> Dfa {
        let m = self.num_classes();
        let mut order = vec![usize::MAX; self.num_states()];
        let mut queue = VecDeque::from([self.start]);
        order[self.start] = 0;
        let mut listed = vec![self.start];
        while let Some(s) = queue.pop_front() {
            for k in 0..m {
                let t = self.next_state(s, k);
                if order[t] == usize::MAX {
                    order[t] = listed.len();
                    listed.push(t);
                    queue.push_back(t);
                }
            }
        }
        let column = |k: usize| -> Vec<usize> { listed.iter().map(|&s| order[self.next_state(s, k)]).collect() };
        let mut bounds = vec![self.bounds[0]];
        let mut cols = vec![column(0)];
        for k in 1..m {
            let col = column(k);
            if &col != cols.last().unwrap() {
                bounds.push(self.bounds[k]);
                cols.push(col);
            }
        }
        let mut trans = Vec::with_capacity(listed.len() * cols.len());
        for i in 0..listed.len() {
            for col in &cols {
                trans.push(col[i]);
            }
        }
        let accept = listed.iter().map(|&s| self.accept[s]).collect();
        Dfa { bounds, trans, accept, start: 0 }
    }

    fn refine(&self, bounds: &[u32]) -> Dfa {
        let mut trans = Vec::with_capacity(self.num_states() * bounds.len());
        for s in 0..self.num_states() {
            for &b in bounds {
                trans.push(self.next_state(s, self.class_of_cp(b)));
            }
        }
        Dfa { bounds: bounds.to_vec(), trans, accept: self.accept.clone(), start: self.start }
    }

    fn common(&self, other: &Dfa) -> (Dfa, Dfa) {
        let union: BTreeSet<u32> = self.bounds.iter().chain(other.bounds.iter()).copied().collect();
        let union: Vec<u32> = union.into_iter().collect();
        (self.refine(&union), other.refine(&union))
    }

    fn product(&self, other: &Dfa) -> Dfa {
        let (a, b) = self.common(other);
        let m = a.num_classes();
        let mut ids: HashMap<(usize, usize), usize> = HashMap::from([((a.start, b.start), 0)]);
        let mut pairs = vec![(a.start, b.start)];
        let mut trans = Vec::new();
        let mut i = 0;
        while i < pairs.len() {
            let (p, q) = pairs[i];
            for k in 0..m {
                let t = (a.next_state(p, k), b.next_state(q, k));
                let next = *ids.entry(t).or_insert_with(|| {
                    pairs.push(t);
                    pairs.len() - 1
                });
                trans.push(next);
            }
            i += 1;
        }
        let accept = pairs.iter().map(|&(p, q)| a.accept[p] && b.accept[q]).collect();
        Dfa { bounds: a.bounds, trans, accept, start: 0 }
    }

    pub fn equivalent(&self, other: &Dfa) -> bool {
        let (a, b) = self.common(other);
        let m = a.num_classes();
        let mut seen = BTreeSet::from([(a.start, b.start)]);
        let mut queue = VecDeque::from([(a.start, b.start)]);
        while let Some((p, q)) = queue.pop_front() {
            if a.accept[p] != b.accept[q] {
                return false;
            }
            for k in 0..m {
                let t = (a.next_state(p, k), b.next_state(q, k));
                if seen.insert(t) {
                    queue.push_back(t);
                }
            }
        }
        true
    }

    /** @id CODE-DFA-009 @implements REQ-DFA-009 */
    pub fn complement(&self) -> Dfa {
        Dfa { accept: self.accept.iter().map(|a| !a).collect(), ..self.clone() }
    }
    pub fn intersect(&self, other: &Dfa) -> Dfa {
        self.product(other)
    }
    pub fn is_empty(&self) -> bool {
        self.shortest_match().is_none()
    }

    /** @id CODE-DFA-010 @implements REQ-DFA-010 */
    pub fn shortest_match(&self) -> Option<String> {
        let m = self.num_classes();
        let mut parent: Vec<Option<(usize, usize)>> = vec![None; self.num_states()];
        let mut seen = vec![false; self.num_states()];
        seen[self.start] = true;
        let mut queue = VecDeque::from([self.start]);
        while let Some(s) = queue.pop_front() {
            if self.accept[s] {
                let mut chars = Vec::new();
                let mut cur = s;
                while let Some((prev, k)) = parent[cur] {
                    chars.push(self.representative(k).unwrap());
                    cur = prev;
                }
                return Some(chars.into_iter().rev().collect());
            }
            for k in 0..m {
                if self.representative(k).is_none() {
                    continue;
                }
                let t = self.next_state(s, k);
                if !seen[t] {
                    seen[t] = true;
                    parent[t] = Some((s, k));
                    queue.push_back(t);
                }
            }
        }
        None
    }

    pub fn representative(&self, class: usize) -> Option<char> {
        let lo = self.bounds[class];
        let hi = self.bounds.get(class + 1).map_or(MAX_CP, |&b| b - 1);
        if (0xD800..=0xDFFF).contains(&lo) {
            return if hi >= 0xE000 { char::from_u32(0xE000) } else { None };
        }
        char::from_u32(lo)
    }

    /** @id CODE-DFA-012 @implements REQ-DFA-012 */
    pub fn live_states(&self) -> Vec<usize> {
        let (n, m) = (self.num_states(), self.num_classes());
        let mut rev = vec![Vec::new(); n];
        for s in 0..n {
            for k in 0..m {
                rev[self.next_state(s, k)].push(s);
            }
        }
        let mut live = vec![false; n];
        let mut stack: Vec<usize> = (0..n).filter(|&s| self.accept[s]).collect();
        while let Some(s) = stack.pop() {
            if !std::mem::replace(&mut live[s], true) {
                stack.extend(rev[s].iter().copied());
            }
        }
        (0..n).filter(|&s| live[s]).collect()
    }
}
