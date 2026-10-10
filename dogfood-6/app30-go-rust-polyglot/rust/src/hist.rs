use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HistError {
    BadQuantile,
    Corrupt,
}

pub const MAX_INDEX: usize = 495;

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Histogram {
    counts: BTreeMap<u16, u64>,
    count: u64,
    sum: u64,
    min: u64,
    max: u64,
}

// @id CODE-HIST-001
// @implements REQ-HIST-001
pub fn bucket_index(v: u64) -> usize {
    let e = (64 - v.leading_zeros() as i64 - 4).max(0) as u32;
    8 * e as usize + (v >> e) as usize
}

// @id CODE-HIST-002
// @implements REQ-HIST-002
pub fn bucket_bounds(i: usize) -> (u64, u64) {
    if i < 8 {
        return (i as u64, i as u64);
    }
    let e = (i / 8 - 1) as u32;
    let m = (i - 8 * e as usize) as u64;
    let lo = m << e;
    let hi = if m == 15 && e == 60 { u64::MAX } else { ((m + 1) << e) - 1 };
    (lo, hi)
}

fn put_varint(out: &mut Vec<u8>, mut v: u64) {
    while v >= 0x80 {
        out.push((v as u8 & 0x7f) | 0x80);
        v >>= 7;
    }
    out.push(v as u8);
}

fn get_varint(b: &[u8], pos: &mut usize) -> Result<u64, HistError> {
    let mut v = 0u64;
    for shift in (0..70).step_by(7) {
        let byte = *b.get(*pos).ok_or(HistError::Corrupt)?;
        *pos += 1;
        if shift == 63 && byte > 1 {
            return Err(HistError::Corrupt);
        }
        v |= ((byte & 0x7f) as u64) << shift;
        if byte & 0x80 == 0 {
            return Ok(v);
        }
    }
    Err(HistError::Corrupt)
}

impl Histogram {
    pub fn new() -> Self {
        Histogram { counts: BTreeMap::new(), count: 0, sum: 0, min: u64::MAX, max: 0 }
    }

    // @id CODE-HIST-004
    // @implements REQ-HIST-004
    pub fn record(&mut self, v: u64) {
        self.record_n(v, 1);
    }

    // @id CODE-HIST-005
    // @implements REQ-HIST-005 REQ-HIST-009
    pub fn record_n(&mut self, v: u64, n: u64) {
        if n == 0 {
            return;
        }
        let slot = self.counts.entry(bucket_index(v) as u16).or_insert(0);
        *slot = slot.saturating_add(n);
        self.count = self.count.saturating_add(n);
        self.sum = self.sum.saturating_add(v.saturating_mul(n));
        self.min = self.min.min(v);
        self.max = self.max.max(v);
    }

    pub fn count(&self) -> u64 {
        self.count
    }
    pub fn sum(&self) -> u64 {
        self.sum
    }
    pub fn min(&self) -> Option<u64> {
        (self.count > 0).then_some(self.min)
    }
    pub fn max(&self) -> Option<u64> {
        (self.count > 0).then_some(self.max)
    }

    // @id CODE-HIST-006
    // @implements REQ-HIST-006
    pub fn merge(&mut self, o: &Histogram) {
        for (&i, &c) in &o.counts {
            let slot = self.counts.entry(i).or_insert(0);
            *slot = slot.saturating_add(c);
        }
        self.count = self.count.saturating_add(o.count);
        self.sum = self.sum.saturating_add(o.sum);
        self.min = self.min.min(o.min);
        self.max = self.max.max(o.max);
    }

    // @id CODE-HIST-007
    // @implements REQ-HIST-007
    pub fn quantile(&self, q: f64) -> Result<Option<u64>, HistError> {
        if !(0.0..=1.0).contains(&q) {
            return Err(HistError::BadQuantile);
        }
        if self.count == 0 {
            return Ok(None);
        }
        let rank = ((q * self.count as f64).ceil() as u64).clamp(1, self.count);
        let mut seen = 0u64;
        for (&i, &c) in &self.counts {
            seen = seen.saturating_add(c);
            if seen >= rank {
                return Ok(Some(bucket_bounds(i as usize).1.min(self.max)));
            }
        }
        Ok(Some(self.max))
    }

    // @id CODE-HIST-008
    // @implements REQ-HIST-008
    pub fn encode(&self) -> Vec<u8> {
        let mut out = Vec::new();
        put_varint(&mut out, self.counts.len() as u64);
        let mut prev = 0u64;
        for (n, (&i, &c)) in self.counts.iter().enumerate() {
            let i = i as u64;
            put_varint(&mut out, if n == 0 { i } else { i - prev });
            put_varint(&mut out, c);
            prev = i;
        }
        put_varint(&mut out, self.sum);
        put_varint(&mut out, self.min);
        put_varint(&mut out, self.max);
        out
    }

    pub fn decode(b: &[u8]) -> Result<Histogram, HistError> {
        let mut pos = 0;
        let n = get_varint(b, &mut pos)?;
        let mut h = Histogram::new();
        let mut prev = 0u64;
        for k in 0..n {
            let d = get_varint(b, &mut pos)?;
            let c = get_varint(b, &mut pos)?;
            if k > 0 && d == 0 {
                return Err(HistError::Corrupt);
            }
            let i = if k == 0 { d } else { prev.checked_add(d).ok_or(HistError::Corrupt)? };
            if i as usize > MAX_INDEX || c == 0 {
                return Err(HistError::Corrupt);
            }
            h.counts.insert(i as u16, c);
            h.count = h.count.saturating_add(c);
            prev = i;
        }
        h.sum = get_varint(b, &mut pos)?;
        h.min = get_varint(b, &mut pos)?;
        h.max = get_varint(b, &mut pos)?;
        let empty_ok = n == 0 && h.sum == 0 && h.min == u64::MAX && h.max == 0;
        if pos != b.len() || !(empty_ok || (n > 0 && h.min <= h.max)) {
            return Err(HistError::Corrupt);
        }
        Ok(h)
    }
}
