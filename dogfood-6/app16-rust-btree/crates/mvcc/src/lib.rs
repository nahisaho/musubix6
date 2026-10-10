use btree::BTree;
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq)]
pub enum MvccError {
    Conflict(Vec<u8>),
}

const TERM: [u8; 2] = [0, 0];

/** @id CODE-MVCC-001 @implements REQ-MVCC-009 */
pub fn encode_key(key: &[u8], ts: u64) -> Vec<u8> {
    let mut o = Vec::with_capacity(key.len() + 10);
    for &b in key {
        o.push(b);
        if b == 0 {
            o.push(0xFF);
        }
    }
    o.extend(TERM);
    o.extend((u64::MAX - ts).to_be_bytes());
    o
}

pub fn decode_key(enc: &[u8]) -> Option<(Vec<u8>, u64)> {
    let mut key = vec![];
    let mut i = 0;
    loop {
        match *enc.get(i)? {
            0 => match *enc.get(i + 1)? {
                0xFF => {
                    key.push(0);
                    i += 2;
                }
                0 => {
                    i += 2;
                    break;
                }
                _ => return None,
            },
            b => {
                key.push(b);
                i += 1;
            }
        }
    }
    let tail: [u8; 8] = enc.get(i..)?.try_into().ok()?;
    Some((key, u64::MAX - u64::from_be_bytes(tail)))
}

fn enc_val(v: &Option<Vec<u8>>) -> Vec<u8> {
    match v {
        Some(v) => {
            let mut o = vec![1];
            o.extend(v);
            o
        }
        None => vec![0],
    }
}

fn dec_val(b: &[u8]) -> Option<Vec<u8>> {
    (b.first() == Some(&1)).then(|| b[1..].to_vec())
}

/// A validated transaction: commit timestamp plus the writes to install.
pub struct Prepared {
    pub ts: u64,
    pub ops: Vec<(Vec<u8>, Option<Vec<u8>>)>,
}

pub struct Txn {
    start_ts: u64,
    writes: BTreeMap<Vec<u8>, Option<Vec<u8>>>,
}

impl Txn {
    pub fn put(&mut self, k: Vec<u8>, v: Vec<u8>) {
        self.writes.insert(k, Some(v));
    }

    pub fn delete(&mut self, k: Vec<u8>) {
        self.writes.insert(k, None);
    }

    pub fn start_ts(&self) -> u64 {
        self.start_ts
    }

    /** @id CODE-MVCC-002 @implements REQ-MVCC-003 */
    pub fn get(&self, s: &Store, k: &[u8]) -> Option<Vec<u8>> {
        match self.writes.get(k) {
            Some(w) => w.clone(),
            None => s.get_at(k, self.start_ts),
        }
    }
}

pub struct Store {
    tree: BTree,
    clock: u64,
    active: BTreeMap<u64, usize>,
}

impl Default for Store {
    fn default() -> Self {
        Self::new()
    }
}

impl Store {
    pub fn new() -> Self {
        Store { tree: BTree::new(8).unwrap(), clock: 0, active: BTreeMap::new() }
    }

    pub fn tree(&self) -> &BTree {
        &self.tree
    }

    /// Rebuilds a store from a checkpointed tree and its clock.
    pub fn from_parts(tree: BTree, clock: u64) -> Self {
        Store { tree, clock, active: BTreeMap::new() }
    }

    pub fn clock(&self) -> u64 {
        self.clock
    }

    pub fn active_snapshots(&self) -> usize {
        self.active.values().sum()
    }

    pub fn version_count(&self) -> usize {
        self.tree.len()
    }

    /** @id CODE-MVCC-003 @implements REQ-MVCC-002 */
    pub fn begin(&mut self) -> Txn {
        *self.active.entry(self.clock).or_insert(0) += 1;
        Txn { start_ts: self.clock, writes: BTreeMap::new() }
    }

    fn release(&mut self, ts: u64) {
        if let Some(n) = self.active.get_mut(&ts) {
            *n -= 1;
            if *n == 0 {
                self.active.remove(&ts);
            }
        }
    }

    /** @id CODE-MVCC-004 @implements REQ-MVCC-010 */
    pub fn abort(&mut self, t: Txn) {
        self.release(t.start_ts);
    }

    /** @id CODE-MVCC-005 @implements REQ-MVCC-006 */
    pub fn get_at(&self, k: &[u8], ts: u64) -> Option<Vec<u8>> {
        let (ek, v) = self.tree.first_ge(&encode_key(k, ts))?;
        let (dk, _) = decode_key(ek)?;
        if dk == k {
            dec_val(v)
        } else {
            None
        }
    }

    fn latest_ts(&self, k: &[u8]) -> Option<u64> {
        let (ek, _) = self.tree.first_ge(&encode_key(k, u64::MAX))?;
        let (dk, ts) = decode_key(ek)?;
        (dk == k).then_some(ts)
    }

    /** @id CODE-MVCC-006 @implements REQ-MVCC-001 REQ-MVCC-004 REQ-MVCC-005 */
    pub fn commit(&mut self, t: Txn) -> Result<u64, MvccError> {
        let p = self.prepare(t)?;
        self.apply_at(p.ts, &p.ops);
        Ok(p.ts)
    }

    /// Validates a transaction and allocates its commit timestamp without applying it.
    pub fn prepare(&mut self, t: Txn) -> Result<Prepared, MvccError> {
        self.release(t.start_ts);
        if t.writes.is_empty() {
            return Ok(Prepared { ts: t.start_ts, ops: vec![] });
        }
        for k in t.writes.keys() {
            if self.latest_ts(k).is_some_and(|ts| ts > t.start_ts) {
                return Err(MvccError::Conflict(k.clone()));
            }
        }
        Ok(Prepared { ts: self.clock + 1, ops: t.writes.into_iter().collect() })
    }

    /// Installs already-committed writes at `ts` (used by recovery).
    pub fn apply_at(&mut self, ts: u64, ops: &[(Vec<u8>, Option<Vec<u8>>)]) {
        for (k, v) in ops {
            self.tree.insert(&encode_key(k, ts), &enc_val(v));
        }
        self.clock = self.clock.max(ts);
    }

    /** @id CODE-MVCC-007 @implements REQ-MVCC-007 REQ-MVCC-008 */
    pub fn gc(&mut self) -> usize {
        let horizon = self.active.keys().next().copied().unwrap_or(self.clock);
        let mut doomed: Vec<Vec<u8>> = vec![];
        let entries = self.tree.entries();
        let mut i = 0;
        while i < entries.len() {
            let (user, _) = decode_key(&entries[i].0).unwrap();
            let mut j = i;
            while j < entries.len() && decode_key(&entries[j].0).unwrap().0 == user {
                j += 1;
            }
            let group = &entries[i..j];
            if let Some(vis) = group.iter().position(|(ek, _)| decode_key(ek).unwrap().1 <= horizon) {
                let drop_from = if vis == 0 && dec_val(&group[0].1).is_none() { 0 } else { vis + 1 };
                doomed.extend(group[drop_from..].iter().map(|(ek, _)| ek.clone()));
            }
            i = j;
        }
        for k in &doomed {
            self.tree.remove(k);
        }
        doomed.len()
    }
}
