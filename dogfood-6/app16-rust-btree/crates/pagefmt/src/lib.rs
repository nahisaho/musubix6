#[derive(Debug, Clone, PartialEq)]
pub enum PageError {
    Full,
    Corrupt,
    BadSize,
}

const fn make_table() -> [u32; 256] {
    let mut t = [0u32; 256];
    let mut i = 0;
    while i < 256 {
        let mut c = i as u32;
        let mut k = 0;
        while k < 8 {
            c = if c & 1 != 0 { 0xEDB88320 ^ (c >> 1) } else { c >> 1 };
            k += 1;
        }
        t[i] = c;
        i += 1;
    }
    t
}
static TABLE: [u32; 256] = make_table();

/** @id CODE-PAGE-001 @implements REQ-PAGE-001 */
pub fn crc32(data: &[u8]) -> u32 {
    let mut c = 0xFFFF_FFFFu32;
    for &b in data {
        c = TABLE[((c ^ b as u32) & 0xFF) as usize] ^ (c >> 8);
    }
    !c
}

const DELETED: u16 = 0xFFFF;
const TRAILER: usize = 4;

/** @id CODE-PAGE-002 @implements REQ-PAGE-002 REQ-PAGE-006 */
#[derive(Debug, Clone, PartialEq)]
pub struct Page {
    buf: Vec<u8>,
}

impl Page {
    pub const HEADER: usize = 4;

    /** @id CODE-PAGE-007 @implements REQ-PAGE-009 */
    pub fn try_new(size: usize) -> Result<Self, PageError> {
        if !(Self::HEADER + TRAILER + 4..=65535).contains(&size) {
            return Err(PageError::BadSize);
        }
        let mut p = Page { buf: vec![0; size] };
        p.set_free_end(size - TRAILER);
        Ok(p)
    }

    pub fn new(size: usize) -> Self {
        Self::try_new(size).expect("bad page size")
    }

    fn rd(&self, at: usize) -> u16 {
        u16::from_le_bytes([self.buf[at], self.buf[at + 1]])
    }
    fn wr(&mut self, at: usize, v: u16) {
        self.buf[at..at + 2].copy_from_slice(&v.to_le_bytes());
    }
    fn nslots(&self) -> usize {
        self.rd(0) as usize
    }
    fn free_end(&self) -> usize {
        self.rd(2) as usize
    }
    fn set_free_end(&mut self, v: usize) {
        self.wr(2, v as u16);
    }
    fn slot(&self, i: usize) -> (usize, u16) {
        let at = Self::HEADER + 4 * i;
        (self.rd(at) as usize, self.rd(at + 2))
    }
    fn set_slot(&mut self, i: usize, off: usize, len: u16) {
        let at = Self::HEADER + 4 * i;
        self.wr(at, off as u16);
        self.wr(at + 2, len);
    }
    fn live_bytes(&self) -> usize {
        (0..self.nslots()).map(|i| self.slot(i).1).filter(|&l| l != DELETED).map(|l| l as usize).sum()
    }

    /** @id CODE-PAGE-003 @implements REQ-PAGE-003 REQ-PAGE-004 */
    pub fn insert(&mut self, cell: &[u8]) -> Result<u16, PageError> {
        if cell.len() >= DELETED as usize {
            return Err(PageError::Full);
        }
        let reuse = (0..self.nslots()).find(|&i| self.slot(i).1 == DELETED);
        let need = cell.len() + if reuse.is_some() { 0 } else { 4 };
        if need > self.free_space() {
            let total = self.buf.len() - TRAILER - Self::HEADER - 4 * self.nslots() - self.live_bytes();
            if need > total {
                return Err(PageError::Full);
            }
            self.compact();
        }
        let idx = match reuse {
            Some(i) => i,
            None => {
                let n = self.nslots();
                self.wr(0, (n + 1) as u16);
                n
            }
        };
        let off = self.free_end() - cell.len();
        self.buf[off..off + cell.len()].copy_from_slice(cell);
        self.set_free_end(off);
        self.set_slot(idx, off, cell.len() as u16);
        Ok(idx as u16)
    }

    pub fn get(&self, slot: u16) -> Option<&[u8]> {
        let i = slot as usize;
        if i >= self.nslots() {
            return None;
        }
        let (off, len) = self.slot(i);
        if len == DELETED {
            return None;
        }
        Some(&self.buf[off..off + len as usize])
    }

    pub fn delete(&mut self, slot: u16) -> bool {
        let i = slot as usize;
        if i >= self.nslots() || self.slot(i).1 == DELETED {
            return false;
        }
        self.set_slot(i, 0, DELETED);
        true
    }

    /** @id CODE-PAGE-004 @implements REQ-PAGE-005 */
    pub fn compact(&mut self) {
        let mut end = self.buf.len() - TRAILER;
        let mut order: Vec<usize> = (0..self.nslots()).filter(|&i| self.slot(i).1 != DELETED).collect();
        order.sort_by_key(|&i| std::cmp::Reverse(self.slot(i).0));
        for i in order {
            let (off, len) = self.slot(i);
            let l = len as usize;
            end -= l;
            self.buf.copy_within(off..off + l, end);
            self.set_slot(i, end, len);
        }
        self.set_free_end(end);
    }

    /** @id CODE-PAGE-005 @implements REQ-PAGE-008 */
    pub fn free_space(&self) -> usize {
        self.free_end() - (Self::HEADER + 4 * self.nslots())
    }

    pub fn to_bytes(&self) -> Vec<u8> {
        let mut out = self.buf.clone();
        let n = out.len() - TRAILER;
        let c = crc32(&out[..n]);
        out[n..].copy_from_slice(&c.to_le_bytes());
        out
    }

    /** @id CODE-PAGE-006 @implements REQ-PAGE-007 */
    pub fn from_bytes(b: &[u8]) -> Result<Page, PageError> {
        if b.len() < Self::HEADER + TRAILER + 4 || b.len() > 65535 {
            return Err(PageError::Corrupt);
        }
        let n = b.len() - TRAILER;
        let stored = u32::from_le_bytes(b[n..].try_into().unwrap());
        if crc32(&b[..n]) != stored {
            return Err(PageError::Corrupt);
        }
        let mut p = Page { buf: b.to_vec() };
        p.buf[n..].fill(0);
        if Self::HEADER + 4 * p.nslots() > p.free_end() || p.free_end() > n {
            return Err(PageError::Corrupt);
        }
        for i in 0..p.nslots() {
            let (off, len) = p.slot(i);
            if len != DELETED && (off < p.free_end() || off + len as usize > n) {
                return Err(PageError::Corrupt);
            }
        }
        Ok(p)
    }
}
