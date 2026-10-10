use mvcc::{decode_key, encode_key, Store};
use std::ops::Bound;

/** @id CODE-ITER-001 @implements REQ-ITER-001 REQ-ITER-004 */
pub struct Scan<'a> {
    store: &'a Store,
    ts: u64,
    lo: Bound<Vec<u8>>,
    hi: Bound<Vec<u8>>,
    done: bool,
}

pub fn scan(store: &Store, ts: u64, lower: Bound<Vec<u8>>, upper: Bound<Vec<u8>>) -> Scan<'_> {
    Scan { store, ts, lo: lower, hi: upper, done: false }
}

impl Scan<'_> {
    /** @id CODE-ITER-002 @implements REQ-ITER-006 */
    fn exhausted(&self) -> bool {
        if self.done {
            return true;
        }
        match (&self.lo, &self.hi) {
            (Bound::Unbounded, _) | (_, Bound::Unbounded) => false,
            (Bound::Included(a), Bound::Included(b)) => a > b,
            (Bound::Included(a) | Bound::Excluded(a), Bound::Included(b) | Bound::Excluded(b)) => a >= b,
        }
    }

    fn within_hi(&self, k: &[u8]) -> bool {
        match &self.hi {
            Bound::Unbounded => true,
            Bound::Included(h) => k <= h.as_slice(),
            Bound::Excluded(h) => k < h.as_slice(),
        }
    }

    fn within_lo(&self, k: &[u8]) -> bool {
        match &self.lo {
            Bound::Unbounded => true,
            Bound::Included(l) => k >= l.as_slice(),
            Bound::Excluded(l) => k > l.as_slice(),
        }
    }
}

impl Iterator for Scan<'_> {
    type Item = (Vec<u8>, Vec<u8>);

    /** @id CODE-ITER-003 @implements REQ-ITER-002 REQ-ITER-005 */
    fn next(&mut self) -> Option<Self::Item> {
        loop {
            if self.exhausted() {
                return None;
            }
            let seek = match &self.lo {
                Bound::Unbounded => vec![],
                Bound::Included(k) => encode_key(k, u64::MAX),
                Bound::Excluded(k) => {
                    let mut s = encode_key(k, 0);
                    s.push(0);
                    s
                }
            };
            let Some((ek, _)) = self.store.tree().first_ge(&seek) else {
                self.done = true;
                return None;
            };
            let (uk, _) = decode_key(ek)?;
            if !self.within_hi(&uk) {
                self.done = true;
                return None;
            }
            self.lo = Bound::Excluded(uk.clone());
            if let Some(v) = self.store.get_at(&uk, self.ts) {
                return Some((uk, v));
            }
        }
    }
}

impl DoubleEndedIterator for Scan<'_> {
    /** @id CODE-ITER-004 @implements REQ-ITER-003 REQ-ITER-007 */
    fn next_back(&mut self) -> Option<Self::Item> {
        loop {
            if self.exhausted() {
                return None;
            }
            let found = match &self.hi {
                Bound::Unbounded => self.store.tree().last(),
                Bound::Included(k) => {
                    let mut s = encode_key(k, 0);
                    s.push(0);
                    self.store.tree().last_lt(&s)
                }
                Bound::Excluded(k) => self.store.tree().last_lt(&encode_key(k, u64::MAX)),
            };
            let Some((ek, _)) = found else {
                self.done = true;
                return None;
            };
            let (uk, _) = decode_key(ek)?;
            if !self.within_lo(&uk) {
                self.done = true;
                return None;
            }
            self.hi = Bound::Excluded(uk.clone());
            if let Some(v) = self.store.get_at(&uk, self.ts) {
                return Some((uk, v));
            }
        }
    }
}
