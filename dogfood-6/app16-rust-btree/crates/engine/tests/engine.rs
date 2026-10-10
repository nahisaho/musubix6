use engine::{Checkpoint, Engine, EngineError, Fault};
use engine::iter::scan;
use std::ops::Bound::Unbounded;
use wal::{recover, Record, SimDisk};

fn b(s: &str) -> Vec<u8> {
    s.as_bytes().to_vec()
}

fn put(e: &mut Engine, k: &str, v: &str) -> u64 {
    let mut t = e.begin();
    t.put(b(k), b(v));
    e.commit(t).unwrap()
}

fn latest(e: &Engine) -> Vec<(Vec<u8>, Vec<u8>)> {
    scan(e.store(), e.clock(), Unbounded, Unbounded).collect()
}

/** @id TEST-ENG-001 @verifies REQ-ENG-001 */
#[test]
fn test_eng_001_commit_logs_and_syncs() {
    let mut e = Engine::open(SimDisk::new()).unwrap();
    let mut t = e.begin();
    t.put(b("a"), b("1"));
    t.delete(b("b"));
    let ts = e.commit(t).unwrap();
    assert_eq!(e.disk().buffered_len(), 0);
    let recs: Vec<Record> = recover(e.disk().durable()).records.into_iter().map(|(_, r)| r).collect();
    assert_eq!(
        recs,
        vec![
            Record::Put { txid: ts, key: b("a"), val: b("1") },
            Record::Delete { txid: ts, key: b("b") },
            Record::Commit { txid: ts },
        ]
    );
    assert_eq!(latest(&e), vec![(b("a"), b("1"))]);
}

/** @id TEST-ENG-002 @verifies REQ-ENG-002 */
#[test]
fn test_eng_002_conflict_writes_nothing() {
    let mut e = Engine::open(SimDisk::new()).unwrap();
    let mut t1 = e.begin();
    let mut t2 = e.begin();
    t1.put(b("k"), b("1"));
    t2.put(b("k"), b("2"));
    e.commit(t1).unwrap();
    let before = e.disk().total_len();
    assert!(e.commit(t2).is_err());
    assert_eq!(e.disk().total_len(), before);
    assert_eq!(latest(&e), vec![(b("k"), b("1"))]);
}

/** @id TEST-ENG-003 @verifies REQ-ENG-003 */
#[test]
fn test_eng_003_committed_survives_crash() {
    let mut e = Engine::open(SimDisk::new()).unwrap();
    put(&mut e, "a", "1");
    let mut t = e.begin();
    t.put(b("b"), b("2"));
    assert_eq!(e.commit_faulty(t, Fault::AfterSync), Err(EngineError::Crashed));
    let r = Engine::open(e.into_disk()).unwrap();
    assert_eq!(latest(&r), vec![(b("a"), b("1")), (b("b"), b("2"))]);
}

/** @id TEST-ENG-004 @verifies REQ-ENG-004 */
#[test]
fn test_eng_004_unsynced_commit_lost() {
    let mut e = Engine::open(SimDisk::new()).unwrap();
    put(&mut e, "a", "1");
    let mut t = e.begin();
    t.put(b("b"), b("2"));
    assert_eq!(e.commit_faulty(t, Fault::BeforeSync), Err(EngineError::Crashed));
    let r = Engine::open(e.into_disk()).unwrap();
    assert_eq!(latest(&r), vec![(b("a"), b("1"))]);
}

/** @id TEST-ENG-005 @verifies REQ-ENG-005 */
#[test]
fn test_eng_005_torn_write_is_atomic() {
    let probe = {
        let mut e = Engine::open(SimDisk::new()).unwrap();
        put(&mut e, "a", "1");
        let a_len = e.disk().total_len();
        let mut t = e.begin();
        t.put(b("b1"), b("x"));
        t.put(b("b2"), b("y"));
        e.commit(t).unwrap();
        e.disk().total_len() - a_len
    };
    for keep in 0..=probe + 3 {
        let mut e = Engine::open(SimDisk::new()).unwrap();
        put(&mut e, "a", "1");
        let mut t = e.begin();
        t.put(b("b1"), b("x"));
        t.put(b("b2"), b("y"));
        assert_eq!(e.commit_faulty(t, Fault::TornSync(keep)), Err(EngineError::Crashed));
        let r = Engine::open(e.into_disk()).unwrap();
        let got = latest(&r);
        if keep >= probe {
            assert_eq!(got.len(), 3, "keep {keep}");
        } else {
            assert_eq!(got, vec![(b("a"), b("1"))], "keep {keep}");
        }
    }
}

/** @id TEST-ENG-006 @verifies REQ-ENG-006 */
#[test]
fn test_eng_006_clock_restored() {
    let mut e = Engine::open(SimDisk::new()).unwrap();
    put(&mut e, "a", "1");
    put(&mut e, "a", "2");
    let last = put(&mut e, "b", "3");
    let mut r = Engine::open(e.into_disk()).unwrap();
    assert_eq!(r.clock(), last);
    let next = put(&mut r, "c", "4");
    assert_eq!(next, last + 1);
    let r2 = Engine::open(r.into_disk()).unwrap();
    assert_eq!(r2.clock(), next);
    assert_eq!(latest(&r2).len(), 3);
}

/** @id TEST-ENG-007 @verifies REQ-ENG-007 */
#[test]
fn test_eng_007_checkpoint_image_recovery() {
    let mut e = Engine::open(SimDisk::new()).unwrap();
    put(&mut e, "a", "1");
    put(&mut e, "b", "2");
    let cp: Checkpoint = e.checkpoint();
    put(&mut e, "b", "3");
    put(&mut e, "c", "4");
    let expect = latest(&e);
    let r = Engine::recover(e.into_disk(), Some(cp)).unwrap();
    assert_eq!(r.replayed(), 2);
    assert_eq!(latest(&r), expect);
}

/** @id TEST-ENG-008 @verifies REQ-ENG-008 */
#[test]
fn test_eng_008_iteration_matches_pre_crash() {
    let mut e = Engine::open(SimDisk::new()).unwrap();
    for i in 0..30 {
        put(&mut e, &format!("k{:02}", i), &format!("v{i}"));
    }
    let mut t = e.begin();
    for i in (0..30).step_by(3) {
        t.delete(b(&format!("k{:02}", i)));
    }
    e.commit(t).unwrap();
    put(&mut e, "k01", "rewritten");
    let before = latest(&e);
    let before_rev: Vec<_> = scan(e.store(), e.clock(), Unbounded, Unbounded).rev().collect();
    let r = Engine::open(e.into_disk()).unwrap();
    assert_eq!(latest(&r), before);
    let after_rev: Vec<_> = scan(r.store(), r.clock(), Unbounded, Unbounded).rev().collect();
    assert_eq!(after_rev, before_rev);
    assert_eq!(before.len(), 20);
}

/** @id TEST-ENG-009 @verifies REQ-ENG-009 */
#[test]
fn test_eng_009_stale_checkpoint_refused() {
    let mut e = Engine::open(SimDisk::new()).unwrap();
    put(&mut e, "a", "1");
    let old = e.checkpoint();
    put(&mut e, "b", "2");
    let _newer = e.checkpoint();
    put(&mut e, "c", "3");
    assert!(matches!(Engine::recover(e.into_disk(), Some(old)), Err(EngineError::StaleCheckpoint)));
}

/** @id TEST-ENG-010 @verifies REQ-ENG-010 */
#[test]
fn test_eng_010_missing_checkpoint_refused() {
    let mut e = Engine::open(SimDisk::new()).unwrap();
    put(&mut e, "a", "1");
    let _cp = e.checkpoint();
    put(&mut e, "b", "2");
    assert!(matches!(Engine::open(e.into_disk()), Err(EngineError::MissingCheckpoint)));
}
