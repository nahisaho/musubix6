use engine::iter::scan;
use mvcc::Store;
use std::ops::Bound::{Excluded, Included, Unbounded};

fn b(s: &str) -> Vec<u8> {
    s.as_bytes().to_vec()
}

fn seed(s: &mut Store, keys: &[&str]) -> u64 {
    let mut t = s.begin();
    for k in keys {
        t.put(b(k), b(&format!("v-{k}")));
    }
    s.commit(t).unwrap()
}

fn keys(it: impl Iterator<Item = (Vec<u8>, Vec<u8>)>) -> Vec<String> {
    it.map(|(k, _)| String::from_utf8(k).unwrap()).collect()
}

/** @id TEST-ITER-001 @verifies REQ-ITER-001 */
#[test]
fn test_iter_001_full_scan_sorted() {
    let mut s = Store::new();
    seed(&mut s, &["d", "a", "c", "b"]);
    seed(&mut s, &["a\0", "ab"]);
    let ts = s.clock();
    let got: Vec<_> = scan(&s, ts, Unbounded, Unbounded).collect();
    assert_eq!(keys(got.clone().into_iter()), ["a", "a\0", "ab", "b", "c", "d"]);
    assert_eq!(got[0].1, b("v-a"));
}

/** @id TEST-ITER-002 @verifies REQ-ITER-002 */
#[test]
fn test_iter_002_bounds() {
    let mut s = Store::new();
    seed(&mut s, &["a", "b", "c", "d", "e"]);
    let ts = s.clock();
    assert_eq!(keys(scan(&s, ts, Included(b("b")), Included(b("d")))), ["b", "c", "d"]);
    assert_eq!(keys(scan(&s, ts, Excluded(b("b")), Excluded(b("d")))), ["c"]);
    assert_eq!(keys(scan(&s, ts, Included(b("b")), Excluded(b("d")))), ["b", "c"]);
    assert_eq!(keys(scan(&s, ts, Excluded(b("b")), Unbounded)), ["c", "d", "e"]);
    assert_eq!(keys(scan(&s, ts, Unbounded, Included(b("bb")))), ["a", "b"]);
    assert_eq!(keys(scan(&s, ts, Included(b("x")), Unbounded)), Vec::<String>::new());
}

/** @id TEST-ITER-003 @verifies REQ-ITER-003 */
#[test]
fn test_iter_003_reverse() {
    let mut s = Store::new();
    seed(&mut s, &["a", "b", "c", "d", "e"]);
    seed(&mut s, &["c"]);
    let ts = s.clock();
    assert_eq!(keys(scan(&s, ts, Unbounded, Unbounded).rev()), ["e", "d", "c", "b", "a"]);
    assert_eq!(keys(scan(&s, ts, Excluded(b("a")), Included(b("d"))).rev()), ["d", "c", "b"]);
    assert_eq!(keys(scan(&s, ts, Included(b("b")), Excluded(b("e"))).rev()), ["d", "c", "b"]);
}

/** @id TEST-ITER-004 @verifies REQ-ITER-004 */
#[test]
fn test_iter_004_snapshot_view() {
    let mut s = Store::new();
    let t1 = seed(&mut s, &["a", "b"]);
    let mut t = s.begin();
    t.put(b("a"), b("new"));
    t.put(b("c"), b("c"));
    let t2 = s.commit(t).unwrap();
    let old: Vec<_> = scan(&s, t1, Unbounded, Unbounded).collect();
    assert_eq!(old, vec![(b("a"), b("v-a")), (b("b"), b("v-b"))]);
    let new: Vec<_> = scan(&s, t2, Unbounded, Unbounded).collect();
    assert_eq!(new, vec![(b("a"), b("new")), (b("b"), b("v-b")), (b("c"), b("c"))]);
    let old_rev: Vec<_> = scan(&s, t1, Unbounded, Unbounded).rev().collect();
    assert_eq!(old_rev, vec![(b("b"), b("v-b")), (b("a"), b("v-a"))]);
}

/** @id TEST-ITER-005 @verifies REQ-ITER-005 */
#[test]
fn test_iter_005_tombstones_skipped() {
    let mut s = Store::new();
    let t1 = seed(&mut s, &["a", "b", "c"]);
    let mut t = s.begin();
    t.delete(b("b"));
    t.delete(b("c"));
    let t2 = s.commit(t).unwrap();
    assert_eq!(keys(scan(&s, t2, Unbounded, Unbounded)), ["a"]);
    assert_eq!(keys(scan(&s, t2, Unbounded, Unbounded).rev()), ["a"]);
    assert_eq!(keys(scan(&s, t1, Unbounded, Unbounded)), ["a", "b", "c"]);
    let mut t = s.begin();
    t.put(b("b"), b("again"));
    let t3 = s.commit(t).unwrap();
    assert_eq!(keys(scan(&s, t3, Unbounded, Unbounded).rev()), ["b", "a"]);
}

/** @id TEST-ITER-006 @verifies REQ-ITER-006 */
#[test]
fn test_iter_006_inverted_bounds_empty() {
    let mut s = Store::new();
    seed(&mut s, &["a", "b", "c"]);
    let ts = s.clock();
    assert_eq!(scan(&s, ts, Included(b("c")), Included(b("a"))).count(), 0);
    assert_eq!(scan(&s, ts, Included(b("b")), Excluded(b("b"))).count(), 0);
    assert_eq!(scan(&s, ts, Excluded(b("b")), Included(b("b"))).count(), 0);
    assert_eq!(scan(&s, ts, Included(b("c")), Included(b("a"))).rev().count(), 0);
    assert_eq!(scan(&s, ts, Included(b("b")), Included(b("b"))).count(), 1);
}

/** @id TEST-ITER-007 @verifies REQ-ITER-007 */
#[test]
fn test_iter_007_mixed_ends_meet() {
    let mut s = Store::new();
    seed(&mut s, &["a", "b", "c", "d", "e"]);
    let ts = s.clock();
    let mut it = scan(&s, ts, Unbounded, Unbounded);
    assert_eq!(it.next().unwrap().0, b("a"));
    assert_eq!(it.next_back().unwrap().0, b("e"));
    assert_eq!(it.next().unwrap().0, b("b"));
    assert_eq!(it.next_back().unwrap().0, b("d"));
    assert_eq!(it.next().unwrap().0, b("c"));
    assert_eq!(it.next_back(), None);
    assert_eq!(it.next(), None);
}
