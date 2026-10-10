use std::f64::consts::PI;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DigestError {
    BadCompression,
    BadInput,
    BadQuantile,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TDigest {
    delta: f64,
    centroids: Vec<(f64, f64)>,
    buffer: Vec<(f64, f64)>,
    total: f64,
    min: f64,
    max: f64,
}

fn interp(x0: f64, p0: f64, x1: f64, p1: f64, t: f64) -> f64 {
    if p1 <= p0 {
        return x1;
    }
    x0 + (x1 - x0) * ((t - p0) / (p1 - p0))
}

impl TDigest {
    // @id CODE-DIGEST-001
    // @implements REQ-DIGEST-001
    pub fn new(compression: f64) -> Result<Self, DigestError> {
        if !compression.is_finite() || !(20.0..=10000.0).contains(&compression) {
            return Err(DigestError::BadCompression);
        }
        Ok(TDigest { delta: compression, centroids: Vec::new(), buffer: Vec::new(), total: 0.0, min: f64::INFINITY, max: f64::NEG_INFINITY })
    }

    // @id CODE-DIGEST-002
    // @implements REQ-DIGEST-002 REQ-DIGEST-003
    pub fn add(&mut self, x: f64, w: f64) -> Result<(), DigestError> {
        if !x.is_finite() || !w.is_finite() || w <= 0.0 {
            return Err(DigestError::BadInput);
        }
        self.buffer.push((x, w));
        self.total += w;
        self.min = self.min.min(x);
        self.max = self.max.max(x);
        if self.buffer.len() >= (8.0 * self.delta) as usize {
            self.compress();
        }
        Ok(())
    }

    pub fn total_weight(&self) -> f64 {
        self.total
    }

    fn k(&self, q: f64) -> f64 {
        self.delta / (2.0 * PI) * (2.0 * q.clamp(0.0, 1.0) - 1.0).asin()
    }

    // @id CODE-DIGEST-004
    // @implements REQ-DIGEST-004 REQ-DIGEST-005 REQ-DIGEST-012
    fn compress(&mut self) {
        if self.buffer.is_empty() {
            return;
        }
        let mut all = std::mem::take(&mut self.centroids);
        all.append(&mut self.buffer);
        all.sort_by(|a, b| a.0.total_cmp(&b.0));
        let mut out: Vec<(f64, f64)> = Vec::new();
        let mut cum = 0.0;
        let mut k_left = self.k(0.0);
        let mut cur = all[0];
        for &item in &all[1..] {
            let w = cur.1 + item.1;
            if self.k((cum + w) / self.total) - k_left <= 1.0 {
                cur = (cur.0 + (item.0 - cur.0) * (item.1 / w), w);
            } else {
                cum += cur.1;
                k_left = self.k(cum / self.total);
                out.push(cur);
                cur = item;
            }
        }
        out.push(cur);
        self.centroids = out;
    }

    pub fn centroids(&mut self) -> Vec<(f64, f64)> {
        self.compress();
        self.centroids.clone()
    }

    // @id CODE-DIGEST-006
    // @implements REQ-DIGEST-006 REQ-DIGEST-007 REQ-DIGEST-008 REQ-DIGEST-011
    pub fn quantile(&mut self, q: f64) -> Result<Option<f64>, DigestError> {
        if !(0.0..=1.0).contains(&q) {
            return Err(DigestError::BadQuantile);
        }
        if self.total == 0.0 {
            return Ok(None);
        }
        if q == 0.0 {
            return Ok(Some(self.min));
        }
        if q == 1.0 {
            return Ok(Some(self.max));
        }
        self.compress();
        let t = q * self.total;
        let mut left = (self.min, 0.0);
        let mut cum = 0.0;
        for &(mean, w) in &self.centroids {
            let pos = cum + w / 2.0;
            if t < pos {
                return Ok(Some(interp(left.0, left.1, mean, pos, t).clamp(self.min, self.max)));
            }
            left = (mean, pos);
            cum += w;
        }
        Ok(Some(interp(left.0, left.1, self.max, self.total, t).clamp(self.min, self.max)))
    }

    // @id CODE-DIGEST-010
    // @implements REQ-DIGEST-010
    pub fn cdf(&mut self, x: f64) -> Option<f64> {
        if self.total == 0.0 || x.is_nan() {
            return None;
        }
        if x < self.min {
            return Some(0.0);
        }
        if x >= self.max {
            return Some(1.0);
        }
        self.compress();
        let mut left = (self.min, 0.0);
        let mut cum = 0.0;
        let mut pts: Vec<(f64, f64)> = Vec::with_capacity(self.centroids.len() + 1);
        for &(mean, w) in &self.centroids {
            pts.push((mean, cum + w / 2.0));
            cum += w;
        }
        pts.push((self.max, self.total));
        for &(px, pp) in &pts {
            if x < px {
                return Some(interp(left.1, left.0, pp, px, x) / self.total);
            }
            left = (px, pp);
        }
        Some(1.0)
    }

    // @id CODE-DIGEST-009
    // @implements REQ-DIGEST-009
    pub fn merge(&mut self, other: &TDigest) {
        if other.total == 0.0 {
            return;
        }
        self.buffer.extend(other.centroids.iter().chain(other.buffer.iter()).copied());
        self.total += other.total;
        self.min = self.min.min(other.min);
        self.max = self.max.max(other.max);
        self.compress();
    }
}
