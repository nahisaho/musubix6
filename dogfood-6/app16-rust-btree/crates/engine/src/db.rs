use btree::{BTree, PageImage};
use mvcc::{Store, Txn};
use wal::{replay, Op, Record, SimDisk, Wal};

#[derive(Debug, Clone, PartialEq)]
pub enum EngineError {
    Crashed,
    Conflict(Vec<u8>),
    StaleCheckpoint,
    MissingCheckpoint,
    BadImage,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Fault {
    BeforeSync,
    TornSync(usize),
    AfterSync,
}

/** @id CODE-ENG-001 @implements REQ-ENG-007 */
pub struct Checkpoint {
    pub lsn: u64,
    pub ts: u64,
    pub image: PageImage,
}

pub struct Engine {
    store: Store,
    wal: Wal,
    replayed: usize,
}

impl Engine {
    pub fn open(d: SimDisk) -> Result<Engine, EngineError> {
        Self::recover(d, None)
    }

    /** @id CODE-ENG-002 @implements REQ-ENG-003 REQ-ENG-004 REQ-ENG-005 REQ-ENG-006 REQ-ENG-007 REQ-ENG-009 REQ-ENG-010 */
    pub fn recover(d: SimDisk, cp: Option<Checkpoint>) -> Result<Engine, EngineError> {
        let (wal, rec) = Wal::open(d);
        let last_cp = rec.records.iter().rev().find(|(_, r)| matches!(r, Record::Checkpoint)).map(|(l, _)| *l);
        let mut store = match (&cp, last_cp) {
            (None, Some(_)) => return Err(EngineError::MissingCheckpoint),
            (Some(c), Some(l)) if c.lsn < l => return Err(EngineError::StaleCheckpoint),
            (Some(c), _) => {
                let tree = BTree::from_pages(&c.image).map_err(|_| EngineError::BadImage)?;
                Store::from_parts(tree, c.ts)
            }
            (None, None) => Store::new(),
        };
        let mut replayed = 0;
        for t in replay(&rec.records) {
            if t.txid <= store.clock() {
                continue;
            }
            let ops: Vec<(Vec<u8>, Option<Vec<u8>>)> = t
                .ops
                .into_iter()
                .map(|o| match o {
                    Op::Put(k, v) => (k, Some(v)),
                    Op::Delete(k) => (k, None),
                })
                .collect();
            store.apply_at(t.txid, &ops);
            replayed += 1;
        }
        Ok(Engine { store, wal, replayed })
    }

    pub fn begin(&mut self) -> Txn {
        self.store.begin()
    }

    /** @id CODE-ENG-003 @implements REQ-ENG-001 REQ-ENG-002 */
    pub fn commit(&mut self, t: Txn) -> Result<u64, EngineError> {
        self.run(t, None)
    }

    pub fn commit_faulty(&mut self, t: Txn, f: Fault) -> Result<u64, EngineError> {
        self.run(t, Some(f))
    }

    fn run(&mut self, t: Txn, fault: Option<Fault>) -> Result<u64, EngineError> {
        let p = self.store.prepare(t).map_err(|e| match e {
            mvcc::MvccError::Conflict(k) => EngineError::Conflict(k),
        })?;
        if p.ops.is_empty() {
            return Ok(p.ts);
        }
        for (k, v) in &p.ops {
            let r = match v {
                Some(v) => Record::Put { txid: p.ts, key: k.clone(), val: v.clone() },
                None => Record::Delete { txid: p.ts, key: k.clone() },
            };
            self.wal.append(&r);
        }
        self.wal.append(&Record::Commit { txid: p.ts });
        match fault {
            Some(Fault::BeforeSync) => return Err(EngineError::Crashed),
            Some(Fault::TornSync(n)) => {
                self.wal.disk_mut().crash_torn(n);
                return Err(EngineError::Crashed);
            }
            _ => self.wal.sync(),
        }
        if fault == Some(Fault::AfterSync) {
            return Err(EngineError::Crashed);
        }
        self.store.apply_at(p.ts, &p.ops);
        Ok(p.ts)
    }

    pub fn checkpoint(&mut self) -> Checkpoint {
        let lsn = self.wal.append(&Record::Checkpoint);
        self.wal.sync();
        let image = self.store.tree().to_pages(8192).expect("page size valid");
        Checkpoint { lsn, ts: self.store.clock(), image }
    }

    pub fn store(&self) -> &Store {
        &self.store
    }

    pub fn clock(&self) -> u64 {
        self.store.clock()
    }

    pub fn replayed(&self) -> usize {
        self.replayed
    }

    pub fn disk(&self) -> &SimDisk {
        self.wal.disk()
    }

    pub fn into_disk(self) -> SimDisk {
        self.wal.into_disk()
    }
}
