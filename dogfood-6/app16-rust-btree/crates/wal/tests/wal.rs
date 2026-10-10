use wal::{recover, replay, Op, Record, SimDisk, Wal};

fn put(tx: u64, k: &str, v: &str) -> Record {
    Record::Put { txid: tx, key: k.into(), val: v.into() }
}

fn log_of(recs: &[Record]) -> Vec<u8> {
    let mut w = Wal::new(SimDisk::new());
    for r in recs {
        w.append(r);
    }
    w.sync();
    w.into_disk().durable().to_vec()
}

/** @id TEST-WAL-001 @verifies REQ-WAL-001 */
#[test]
fn test_wal_001_lsn_increase() {
    let mut w = Wal::new(SimDisk::new());
    assert_eq!(w.append(&put(1, "a", "1")), 1);
    assert_eq!(w.append(&Record::Commit { txid: 1 }), 2);
    assert_eq!(w.append(&Record::Abort { txid: 2 }), 3);
}

/** @id TEST-WAL-002 @verifies REQ-WAL-002 */
#[test]
fn test_wal_002_roundtrip() {
    let recs = vec![
        put(1, "a", "1"),
        Record::Delete { txid: 1, key: b"b".to_vec() },
        Record::Commit { txid: 1 },
        Record::Checkpoint,
        put(2, "", ""),
    ];
    let bytes = log_of(&recs);
    let r = recover(&bytes);
    assert_eq!(r.valid_len, bytes.len());
    let got: Vec<Record> = r.records.iter().map(|(_, x)| x.clone()).collect();
    assert_eq!(got, recs);
    let lsns: Vec<u64> = r.records.iter().map(|(l, _)| *l).collect();
    assert_eq!(lsns, vec![1, 2, 3, 4, 5]);
}

/** @id TEST-WAL-003 @verifies REQ-WAL-003 */
#[test]
fn test_wal_003_crash_loses_unsynced() {
    let mut w = Wal::new(SimDisk::new());
    w.append(&put(1, "a", "1"));
    w.append(&Record::Commit { txid: 1 });
    w.sync();
    let synced = w.disk().durable().len();
    w.append(&put(2, "b", "2"));
    assert!(w.disk().buffered_len() > 0);
    let mut disk = w.into_disk();
    disk.crash();
    assert_eq!(disk.durable().len(), synced);
    assert_eq!(disk.buffered_len(), 0);
    assert_eq!(recover(disk.durable()).records.len(), 2);
}

/** @id TEST-WAL-004 @verifies REQ-WAL-004 */
#[test]
fn test_wal_004_torn_tail_every_offset() {
    let mut w = Wal::new(SimDisk::new());
    let mut ends = vec![0usize];
    for r in [put(1, "key", "value"), Record::Commit { txid: 1 }, put(2, "k2", "v2")] {
        w.append(&r);
        ends.push(w.disk().total_len());
    }
    w.sync();
    let bytes = w.into_disk().durable().to_vec();
    for cut in 0..=bytes.len() {
        let r = recover(&bytes[..cut]);
        let whole = ends.iter().filter(|&&e| e <= cut && e > 0).count();
        assert_eq!(r.records.len(), whole, "cut {cut}");
        assert_eq!(r.valid_len, ends[whole], "cut {cut}");
    }
}

/** @id TEST-WAL-005 @verifies REQ-WAL-005 */
#[test]
fn test_wal_005_corruption_stops_scan() {
    let mut w = Wal::new(SimDisk::new());
    w.append(&put(1, "a", "1"));
    let first_end = w.disk().total_len();
    w.append(&put(2, "b", "2"));
    let second_end = w.disk().total_len();
    w.append(&put(3, "c", "3"));
    w.sync();
    let bytes = w.into_disk().durable().to_vec();
    for pos in first_end..second_end {
        let mut b = bytes.clone();
        b[pos] ^= 0x40;
        let r = recover(&b);
        assert_eq!(r.records.len(), 1, "pos {pos}");
        assert_eq!(r.valid_len, first_end, "pos {pos}");
    }
}

/** @id TEST-WAL-006 @verifies REQ-WAL-006 */
#[test]
fn test_wal_006_commit_order() {
    let bytes = log_of(&[
        put(1, "a", "1"),
        put(2, "b", "2"),
        Record::Commit { txid: 2 },
        Record::Delete { txid: 1, key: b"c".to_vec() },
        Record::Commit { txid: 1 },
    ]);
    let txns = replay(&recover(&bytes).records);
    assert_eq!(txns.len(), 2);
    assert_eq!(txns[0].txid, 2);
    assert_eq!(txns[0].ops, vec![Op::Put(b"b".to_vec(), b"2".to_vec())]);
    assert_eq!(txns[1].txid, 1);
    assert_eq!(txns[1].ops, vec![Op::Put(b"a".to_vec(), b"1".to_vec()), Op::Delete(b"c".to_vec())]);
    assert!(txns[0].commit_lsn < txns[1].commit_lsn);
}

/** @id TEST-WAL-007 @verifies REQ-WAL-007 */
#[test]
fn test_wal_007_abort_and_uncommitted_omitted() {
    let bytes = log_of(&[
        put(1, "a", "1"),
        Record::Abort { txid: 1 },
        put(2, "b", "2"),
        put(3, "c", "3"),
        Record::Commit { txid: 3 },
    ]);
    let txns = replay(&recover(&bytes).records);
    assert_eq!(txns.len(), 1);
    assert_eq!(txns[0].txid, 3);
}

/** @id TEST-WAL-008 @verifies REQ-WAL-008 */
#[test]
fn test_wal_008_checkpoint_skips_old_commits() {
    let bytes = log_of(&[
        put(1, "a", "1"),
        Record::Commit { txid: 1 },
        put(2, "straddle", "x"),
        Record::Checkpoint,
        Record::Commit { txid: 2 },
        put(3, "c", "3"),
        Record::Commit { txid: 3 },
    ]);
    let txns = replay(&recover(&bytes).records);
    let ids: Vec<u64> = txns.iter().map(|t| t.txid).collect();
    assert_eq!(ids, vec![2, 3]);
    assert_eq!(txns[0].ops.len(), 1);
}

/** @id TEST-WAL-009 @verifies REQ-WAL-009 */
#[test]
fn test_wal_009_open_truncates_torn_tail() {
    let mut bytes = log_of(&[put(1, "a", "1"), Record::Commit { txid: 1 }]);
    let good = bytes.len();
    bytes.extend_from_slice(&[9, 0, 0, 0, 1, 2, 3]);
    let (mut w, rec) = Wal::open(SimDisk::from_durable(bytes));
    assert_eq!(rec.valid_len, good);
    assert_eq!(w.disk().durable().len(), good);
    assert_eq!(w.append(&put(2, "b", "2")), 3);
    w.sync();
    let after = recover(w.disk().durable());
    assert_eq!(after.records.len(), 3);
    assert_eq!(after.valid_len, w.disk().durable().len());
}
