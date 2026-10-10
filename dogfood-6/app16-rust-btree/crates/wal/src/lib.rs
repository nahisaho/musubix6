use pagefmt::crc32;
use std::collections::HashMap;

const HEADER: usize = 16;

#[derive(Debug, Clone, PartialEq)]
pub enum Record {
    Put { txid: u64, key: Vec<u8>, val: Vec<u8> },
    Delete { txid: u64, key: Vec<u8> },
    Commit { txid: u64 },
    Abort { txid: u64 },
    Checkpoint,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Op {
    Put(Vec<u8>, Vec<u8>),
    Delete(Vec<u8>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct CommittedTxn {
    pub txid: u64,
    pub commit_lsn: u64,
    pub ops: Vec<Op>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Recovery {
    pub records: Vec<(u64, Record)>,
    pub valid_len: usize,
}

/** @id CODE-WAL-001 @implements REQ-WAL-003 */
#[derive(Debug, Clone, Default)]
pub struct SimDisk {
    durable: Vec<u8>,
    buffer: Vec<u8>,
}

impl SimDisk {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn from_durable(b: Vec<u8>) -> Self {
        SimDisk { durable: b, buffer: vec![] }
    }
    pub fn durable(&self) -> &[u8] {
        &self.durable
    }
    pub fn buffered_len(&self) -> usize {
        self.buffer.len()
    }
    pub fn total_len(&self) -> usize {
        self.durable.len() + self.buffer.len()
    }
    pub fn write(&mut self, b: &[u8]) {
        self.buffer.extend_from_slice(b);
    }
    pub fn sync(&mut self) {
        self.durable.append(&mut self.buffer);
    }
    pub fn crash(&mut self) {
        self.buffer.clear();
    }
    /// Crash that persists only the first `keep` buffered bytes (torn write).
    pub fn crash_torn(&mut self, keep: usize) {
        let keep = keep.min(self.buffer.len());
        self.durable.extend_from_slice(&self.buffer[..keep]);
        self.buffer.clear();
    }
    pub fn truncate_durable(&mut self, len: usize) {
        self.durable.truncate(len);
    }
}

fn encode(r: &Record) -> Vec<u8> {
    let mut o = vec![];
    let bytes = |o: &mut Vec<u8>, b: &[u8]| {
        o.extend((b.len() as u32).to_le_bytes());
        o.extend(b);
    };
    match r {
        Record::Put { txid, key, val } => {
            o.push(1);
            o.extend(txid.to_le_bytes());
            bytes(&mut o, key);
            bytes(&mut o, val);
        }
        Record::Delete { txid, key } => {
            o.push(2);
            o.extend(txid.to_le_bytes());
            bytes(&mut o, key);
        }
        Record::Commit { txid } => {
            o.push(3);
            o.extend(txid.to_le_bytes());
        }
        Record::Abort { txid } => {
            o.push(4);
            o.extend(txid.to_le_bytes());
        }
        Record::Checkpoint => o.push(5),
    }
    o
}

fn decode(p: &[u8]) -> Option<Record> {
    let mut pos = 1;
    let u64_ = |pos: &mut usize| -> Option<u64> {
        let v = u64::from_le_bytes(p.get(*pos..*pos + 8)?.try_into().ok()?);
        *pos += 8;
        Some(v)
    };
    let blob = |pos: &mut usize| -> Option<Vec<u8>> {
        let n = u32::from_le_bytes(p.get(*pos..*pos + 4)?.try_into().ok()?) as usize;
        *pos += 4;
        let v = p.get(*pos..pos.checked_add(n)?)?.to_vec();
        *pos += n;
        Some(v)
    };
    let r = match *p.first()? {
        1 => {
            let txid = u64_(&mut pos)?;
            let key = blob(&mut pos)?;
            let val = blob(&mut pos)?;
            Record::Put { txid, key, val }
        }
        2 => {
            let txid = u64_(&mut pos)?;
            Record::Delete { txid, key: blob(&mut pos)? }
        }
        3 => Record::Commit { txid: u64_(&mut pos)? },
        4 => Record::Abort { txid: u64_(&mut pos)? },
        5 => Record::Checkpoint,
        _ => return None,
    };
    (pos == p.len()).then_some(r)
}

pub struct Wal {
    disk: SimDisk,
    next_lsn: u64,
}

impl Wal {
    pub fn new(disk: SimDisk) -> Self {
        Wal { disk, next_lsn: 1 }
    }

    /** @id CODE-WAL-002 @implements REQ-WAL-009 */
    pub fn open(mut disk: SimDisk) -> (Wal, Recovery) {
        disk.crash();
        let rec = recover(disk.durable());
        disk.truncate_durable(rec.valid_len);
        let next_lsn = rec.records.last().map_or(1, |(l, _)| l + 1);
        (Wal { disk, next_lsn }, rec)
    }

    /** @id CODE-WAL-003 @implements REQ-WAL-001 REQ-WAL-002 */
    pub fn append(&mut self, r: &Record) -> u64 {
        let lsn = self.next_lsn;
        self.next_lsn += 1;
        let payload = encode(r);
        let mut body = lsn.to_le_bytes().to_vec();
        body.extend(&payload);
        let mut frame = (payload.len() as u32).to_le_bytes().to_vec();
        frame.extend(crc32(&body).to_le_bytes());
        frame.extend(body);
        self.disk.write(&frame);
        lsn
    }

    pub fn sync(&mut self) {
        self.disk.sync();
    }

    pub fn disk(&self) -> &SimDisk {
        &self.disk
    }

    pub fn disk_mut(&mut self) -> &mut SimDisk {
        &mut self.disk
    }

    pub fn into_disk(self) -> SimDisk {
        self.disk
    }
}

/** @id CODE-WAL-004 @implements REQ-WAL-004 REQ-WAL-005 */
pub fn recover(bytes: &[u8]) -> Recovery {
    let mut records = vec![];
    let mut pos = 0;
    let mut expect = 1u64;
    while bytes.len() - pos >= HEADER {
        let len = u32::from_le_bytes(bytes[pos..pos + 4].try_into().unwrap()) as usize;
        if len > bytes.len() - pos - HEADER {
            break;
        }
        let crc = u32::from_le_bytes(bytes[pos + 4..pos + 8].try_into().unwrap());
        let body = &bytes[pos + 8..pos + HEADER + len];
        if crc32(body) != crc {
            break;
        }
        let lsn = u64::from_le_bytes(body[..8].try_into().unwrap());
        if lsn != expect {
            break;
        }
        let Some(rec) = decode(&body[8..]) else { break };
        records.push((lsn, rec));
        expect += 1;
        pos += HEADER + len;
    }
    Recovery { records, valid_len: pos }
}

/** @id CODE-WAL-005 @implements REQ-WAL-006 REQ-WAL-007 REQ-WAL-008 */
pub fn replay(records: &[(u64, Record)]) -> Vec<CommittedTxn> {
    let mut pending: HashMap<u64, Vec<Op>> = HashMap::new();
    let mut out: Vec<CommittedTxn> = vec![];
    for (lsn, r) in records {
        match r {
            Record::Put { txid, key, val } => pending.entry(*txid).or_default().push(Op::Put(key.clone(), val.clone())),
            Record::Delete { txid, key } => pending.entry(*txid).or_default().push(Op::Delete(key.clone())),
            Record::Abort { txid } => {
                pending.remove(txid);
            }
            Record::Commit { txid } => {
                let ops = pending.remove(txid).unwrap_or_default();
                out.push(CommittedTxn { txid: *txid, commit_lsn: *lsn, ops });
            }
            Record::Checkpoint => out.clear(),
        }
    }
    out
}
