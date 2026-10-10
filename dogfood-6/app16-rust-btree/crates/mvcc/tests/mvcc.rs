use mvcc::{decode_key, encode_key, MvccError, Store};

fn b(s: &str) -> Vec<u8> {
    s.as_bytes().to_vec()
}

fn commit_put(s: &mut Store, k: &str, v: &str) -> u64 {
    let mut t = s.begin();
    t.put(b(k), b(v));
    s.commit(t).unwrap()
}

/** @id TEST-MVCC-001 @verifies REQ-MVCC-001 */
#[test]
fn test_mvcc_001_commit_then_read() {
    let mut s = Store::new();
    let ts = commit_put(&mut s, "a", "1");
    assert_eq!(ts, 1);
    let t = s.begin();
    assert_eq!(t.get(&s, b"a"), Some(b("1")));
    assert_eq!(t.get(&s, b"zz"), None);
}

/** @id TEST-MVCC-002 @verifies REQ-MVCC-002 */
#[test]
fn test_mvcc_002_snapshot_isolation() {
    let mut s = Store::new();
    commit_put(&mut s, "a", "old");
    let reader = s.begin();
    commit_put(&mut s, "a", "new");
    commit_put(&mut s, "b", "x");
    assert_eq!(reader.get(&s, b"a"), Some(b("old")));
    assert_eq!(reader.get(&s, b"b"), None);
    let fresh = s.begin();
    assert_eq!(fresh.get(&s, b"a"), Some(b("new")));
}

/** @id TEST-MVCC-003 @verifies REQ-MVCC-003 */
#[test]
fn test_mvcc_003_read_your_writes() {
    let mut s = Store::new();
    commit_put(&mut s, "a", "1");
    let mut t = s.begin();
    t.put(b("a"), b("mine"));
    assert_eq!(t.get(&s, b"a"), Some(b("mine")));
    t.delete(b("a"));
    assert_eq!(t.get(&s, b"a"), None);
    let other = s.begin();
    assert_eq!(other.get(&s, b"a"), Some(b("1")));
}

/** @id TEST-MVCC-004 @verifies REQ-MVCC-004 */
#[test]
fn test_mvcc_004_write_write_conflict() {
    let mut s = Store::new();
    let mut t1 = s.begin();
    let mut t2 = s.begin();
    t1.put(b("k"), b("1"));
    t2.put(b("k"), b("2"));
    t2.put(b("other"), b("z"));
    s.commit(t1).unwrap();
    assert_eq!(s.commit(t2), Err(MvccError::Conflict(b("k"))));
    assert_eq!(s.active_snapshots(), 0);
    let r = s.begin();
    assert_eq!(r.get(&s, b"k"), Some(b("1")));
    assert_eq!(r.get(&s, b"other"), None);
}

/** @id TEST-MVCC-005 @verifies REQ-MVCC-005 */
#[test]
fn test_mvcc_005_disjoint_writes_commit() {
    let mut s = Store::new();
    let mut t1 = s.begin();
    let mut t2 = s.begin();
    t1.put(b("a"), b("1"));
    t2.put(b("b"), b("2"));
    let c1 = s.commit(t1).unwrap();
    let c2 = s.commit(t2).unwrap();
    assert!(c2 > c1);
    let r = s.begin();
    assert_eq!(r.get(&s, b"a"), Some(b("1")));
    assert_eq!(r.get(&s, b"b"), Some(b("2")));
}

/** @id TEST-MVCC-006 @verifies REQ-MVCC-006 */
#[test]
fn test_mvcc_006_delete_visibility() {
    let mut s = Store::new();
    commit_put(&mut s, "a", "1");
    let old = s.begin();
    let mut t = s.begin();
    t.delete(b("a"));
    s.commit(t).unwrap();
    let new = s.begin();
    assert_eq!(new.get(&s, b"a"), None);
    assert_eq!(old.get(&s, b"a"), Some(b("1")));
}

/** @id TEST-MVCC-007 @verifies REQ-MVCC-007 */
#[test]
fn test_mvcc_007_gc_respects_snapshots() {
    let mut s = Store::new();
    commit_put(&mut s, "k", "v1");
    commit_put(&mut s, "k", "v2");
    let holder = s.begin();
    commit_put(&mut s, "k", "v3");
    assert_eq!(s.version_count(), 3);
    assert_eq!(s.gc(), 1);
    assert_eq!(holder.get(&s, b"k"), Some(b("v2")));
    assert_eq!(s.version_count(), 2);
    s.abort(holder);
    assert_eq!(s.gc(), 1);
    assert_eq!(s.version_count(), 1);
    let r = s.begin();
    assert_eq!(r.get(&s, b"k"), Some(b("v3")));
}

/** @id TEST-MVCC-008 @verifies REQ-MVCC-008 */
#[test]
fn test_mvcc_008_gc_drops_dead_keys() {
    let mut s = Store::new();
    commit_put(&mut s, "k", "v");
    let holder = s.begin();
    let mut t = s.begin();
    t.delete(b("k"));
    s.commit(t).unwrap();
    assert_eq!(s.gc(), 0);
    assert_eq!(s.version_count(), 2);
    s.abort(holder);
    assert_eq!(s.gc(), 2);
    assert_eq!(s.version_count(), 0);
    assert!(s.tree().is_empty());
}

/** @id TEST-MVCC-009 @verifies REQ-MVCC-009 */
#[test]
fn test_mvcc_009_key_encoding_order() {
    let a5 = encode_key(b"a", 5);
    let a3 = encode_key(b"a", 3);
    let a0 = encode_key(b"a\0", 9);
    let ab = encode_key(b"ab", 9);
    let e = encode_key(b"", 1);
    assert!(e < a5);
    assert!(a5 < a3, "newest first");
    assert!(a3 < a0, "a < a\\0");
    assert!(a0 < ab, "a\\0 < ab");
    for (k, ts) in [(&b""[..], 1u64), (b"a\0\0b", 77), (b"\0", u64::MAX), (b"zz", 0)] {
        assert_eq!(decode_key(&encode_key(k, ts)), Some((k.to_vec(), ts)));
    }
    assert_eq!(decode_key(b"nonsense"), None);
}

/** @id TEST-MVCC-010 @verifies REQ-MVCC-010 */
#[test]
fn test_mvcc_010_abort_releases() {
    let mut s = Store::new();
    commit_put(&mut s, "a", "1");
    let mut t = s.begin();
    t.put(b("a"), b("2"));
    assert_eq!(s.active_snapshots(), 1);
    s.abort(t);
    assert_eq!(s.active_snapshots(), 0);
    assert_eq!(s.clock(), 1);
    let r = s.begin();
    assert_eq!(r.get(&s, b"a"), Some(b("1")));
}
