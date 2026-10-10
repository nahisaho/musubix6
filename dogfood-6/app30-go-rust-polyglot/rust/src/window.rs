use std::collections::BTreeMap;

use crate::hist::Histogram;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WindowError {
    BadSpec,
    Overflow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Observed {
    Accepted,
    PartiallyLate,
    Late,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WindowSpec {
    size: i64,
    slide: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ClosedWindow {
    pub start: i64,
    pub end: i64,
    pub count: u64,
    pub sum: u64,
    pub min: u64,
    pub max: u64,
    pub hist: Histogram,
}

impl WindowSpec {
    // @id CODE-WINDOW-001
    // @implements REQ-WINDOW-001
    pub fn new(size: i64, slide: i64) -> Result<Self, WindowError> {
        if size <= 0 || slide <= 0 || slide > size || size % slide != 0 {
            return Err(WindowError::BadSpec);
        }
        Ok(WindowSpec { size, slide })
    }

    // @id CODE-WINDOW-002
    // @implements REQ-WINDOW-002 REQ-WINDOW-003 REQ-WINDOW-004
    pub fn window_starts(&self, ts: i64) -> Result<Vec<i64>, WindowError> {
        let last = ts.checked_sub(ts.rem_euclid(self.slide)).ok_or(WindowError::Overflow)?;
        last.checked_add(self.size).ok_or(WindowError::Overflow)?;
        let n = self.size / self.slide;
        let first = last.checked_sub((n - 1) * self.slide).ok_or(WindowError::Overflow)?;
        Ok((0..n).map(|i| first + i * self.slide).collect())
    }
}

struct Acc {
    count: u64,
    sum: u64,
    min: u64,
    max: u64,
    hist: Histogram,
}

#[derive(Debug)]
pub struct Aggregator {
    spec: WindowSpec,
    lateness: i64,
    open: BTreeMap<i64, Acc>,
    max_ts: Option<i64>,
    closed_until: i64,
    late: u64,
}

impl std::fmt::Debug for Acc {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Acc({})", self.count)
    }
}

impl Aggregator {
    pub fn new(spec: WindowSpec, lateness: i64) -> Self {
        Aggregator { spec, lateness: lateness.max(0), open: BTreeMap::new(), max_ts: None, closed_until: i64::MIN, late: 0 }
    }

    // @id CODE-WINDOW-005
    // @implements REQ-WINDOW-005 REQ-WINDOW-008 REQ-WINDOW-010 REQ-WINDOW-011
    pub fn observe(&mut self, ts: i64, v: u64) -> Result<Observed, WindowError> {
        let starts = self.spec.window_starts(ts)?;
        let wm = self.watermark();
        let mut closed = 0;
        for &s in &starts {
            let end = s + self.spec.size;
            if wm.map_or(false, |w| end <= w) || end <= self.closed_until {
                closed += 1;
                continue;
            }
            let acc = self.open.entry(s).or_insert_with(Self::empty_acc);
            Self::accumulate(acc, v);
        }
        if closed == starts.len() {
            self.late += 1;
            return Ok(Observed::Late);
        }
        self.max_ts = Some(self.max_ts.map_or(ts, |m| m.max(ts)));
        Ok(if closed == 0 { Observed::Accepted } else { Observed::PartiallyLate })
    }

    // @id CODE-WINDOW-006
    // @implements REQ-WINDOW-006
    pub fn watermark(&self) -> Option<i64> {
        self.max_ts.map(|m| m.saturating_sub(self.lateness))
    }

    fn empty_acc() -> Acc {
        Acc { count: 0, sum: 0, min: u64::MAX, max: 0, hist: Histogram::new() }
    }

    fn accumulate(acc: &mut Acc, v: u64) {
        acc.count = acc.count.saturating_add(1);
        acc.sum = acc.sum.saturating_add(v);
        acc.min = acc.min.min(v);
        acc.max = acc.max.max(v);
        acc.hist.record(v);
    }

    fn emit(&self, start: i64, a: Acc) -> ClosedWindow {
        ClosedWindow { start, end: start + self.spec.size, count: a.count, sum: a.sum, min: a.min, max: a.max, hist: a.hist }
    }

    // @id CODE-WINDOW-007
    // @implements REQ-WINDOW-007
    pub fn take_closed(&mut self) -> Vec<ClosedWindow> {
        let mut out = Vec::new();
        let Some(wm) = self.watermark() else { return out };
        while let Some((&s, _)) = self.open.iter().next() {
            if s + self.spec.size > wm {
                break;
            }
            let a = self.open.remove(&s).unwrap();
            out.push(self.emit(s, a));
        }
        out
    }

    // @id CODE-WINDOW-009
    // @implements REQ-WINDOW-009
    pub fn flush(&mut self) -> Vec<ClosedWindow> {
        let open = std::mem::take(&mut self.open);
        let mut out = Vec::new();
        for (s, a) in open {
            self.closed_until = self.closed_until.max(s + self.spec.size);
            out.push(self.emit(s, a));
        }
        out
    }

    pub fn late_count(&self) -> u64 {
        self.late
    }
}
