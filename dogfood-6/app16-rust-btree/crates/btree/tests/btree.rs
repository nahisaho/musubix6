use btree::{BTree, BTreeError};
use pagefmt::PageError;

fn k(i: u32) -> Vec<u8> {
    format!("k{:05}", i).into_bytes()
}

fn lcg(seed: &mut u64) -> u32 {
    *seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    (*seed >> 33) as u32
}

/** @id TEST-BT-001 @verifies REQ-BT-001 */
#[test]
fn test_bt_001_insert_get() {
    let mut t = BTree::new(4).unwrap();
    assert_eq!(t.insert(b"a", b"1"), None);
    assert_eq!(t.get(b"a"), Some(&b"1"[..]));
    assert_eq!(t.get(b"b"), None);
    assert_eq!(t.len(), 1);
}

/** @id TEST-BT-002 @verifies REQ-BT-002 */
#[test]
fn test_bt_002_replace_returns_old() {
    let mut t = BTree::new(4).unwrap();
    t.insert(b"a", b"1");
    assert_eq!(t.insert(b"a", b"2"), Some(b"1".to_vec()));
    assert_eq!(t.get(b"a"), Some(&b"2"[..]));
    assert_eq!(t.len(), 1);
}

/** @id TEST-BT-003 @verifies REQ-BT-003 */
#[test]
fn test_bt_003_split_keeps_invariants() {
    let mut t = BTree::new(4).unwrap();
    for i in 0..5 {
        t.insert(&k(i), b"v");
        t.check_invariants().unwrap();
    }
    assert_eq!(t.height(), 2);
    for i in 5..200 {
        t.insert(&k(i), b"v");
        t.check_invariants().unwrap();
    }
    assert!(t.height() >= 3);
}

/** @id TEST-BT-004 @verifies REQ-BT-004 */
#[test]
fn test_bt_004_random_inserts_sorted() {
    let mut seed = 42;
    let mut t = BTree::new(5).unwrap();
    let mut model = std::collections::BTreeMap::new();
    for _ in 0..1000 {
        let n = lcg(&mut seed) % 5000;
        t.insert(&k(n), &n.to_le_bytes());
        model.insert(k(n), n.to_le_bytes().to_vec());
    }
    t.check_invariants().unwrap();
    assert_eq!(t.len(), model.len());
    for (key, v) in &model {
        assert_eq!(t.get(key), Some(&v[..]));
    }
    let got: Vec<Vec<u8>> = t.entries().into_iter().map(|(a, _)| a).collect();
    let want: Vec<Vec<u8>> = model.keys().cloned().collect();
    assert_eq!(got, want);
}

/** @id TEST-BT-005 @verifies REQ-BT-005 */
#[test]
fn test_bt_005_remove_returns_value() {
    let mut t = BTree::new(4).unwrap();
    for i in 0..20 {
        t.insert(&k(i), &[i as u8]);
    }
    assert_eq!(t.remove(&k(7)), Some(vec![7]));
    assert_eq!(t.get(&k(7)), None);
    assert_eq!(t.remove(&k(7)), None);
    assert_eq!(t.remove(&k(99)), None);
    assert_eq!(t.len(), 19);
}

/** @id TEST-BT-006 @verifies REQ-BT-006 */
#[test]
fn test_bt_006_rebalance_borrow_and_merge() {
    let mut t = BTree::new(4).unwrap();
    let mut seed = 7;
    let mut keys: Vec<u32> = (0..300).collect();
    for i in (1..keys.len()).rev() {
        keys.swap(i, lcg(&mut seed) as usize % (i + 1));
    }
    for &i in &keys {
        t.insert(&k(i), b"v");
    }
    t.check_invariants().unwrap();
    for i in (1..keys.len()).rev() {
        keys.swap(i, lcg(&mut seed) as usize % (i + 1));
    }
    for &i in &keys {
        assert!(t.remove(&k(i)).is_some());
        t.check_invariants().unwrap();
    }
    let s = t.stats();
    assert!(s.borrows > 0, "borrows {}", s.borrows);
    assert!(s.merges > 0, "merges {}", s.merges);
}

/** @id TEST-BT-007 @verifies REQ-BT-007 */
#[test]
fn test_bt_007_collapse_to_empty_root() {
    let mut t = BTree::new(3).unwrap();
    for i in 0..100 {
        t.insert(&k(i), b"v");
    }
    assert!(t.height() > 2);
    for i in 0..100 {
        t.remove(&k(i));
    }
    assert!(t.is_empty());
    assert_eq!(t.height(), 1);
    t.check_invariants().unwrap();
    t.insert(b"again", b"1");
    assert_eq!(t.get(b"again"), Some(&b"1"[..]));
}

/** @id TEST-BT-008 @verifies REQ-BT-008 */
#[test]
fn test_bt_008_seek_neighbours() {
    let mut t = BTree::new(4).unwrap();
    for i in (0..100).step_by(10) {
        t.insert(&k(i), &[i as u8]);
    }
    assert_eq!(t.first_ge(&k(20)).unwrap().0, &k(20)[..]);
    assert_eq!(t.first_ge(&k(21)).unwrap().0, &k(30)[..]);
    assert_eq!(t.first_ge(&k(91)), None);
    assert_eq!(t.last_lt(&k(20)).unwrap().0, &k(10)[..]);
    assert_eq!(t.last_lt(&k(21)).unwrap().0, &k(20)[..]);
    assert_eq!(t.last_lt(&k(0)), None);
    assert_eq!(t.last_lt(&k(500)).unwrap().0, &k(90)[..]);
    assert_eq!(t.first_ge(b"").unwrap().0, &k(0)[..]);
}

/** @id TEST-BT-009 @verifies REQ-BT-009 */
#[test]
fn test_bt_009_page_roundtrip() {
    let mut t = BTree::new(4).unwrap();
    for i in 0..60 {
        t.insert(&k(i), format!("value-{i}").as_bytes());
    }
    for i in (0..60).step_by(4) {
        t.remove(&k(i));
    }
    let img = t.to_pages(512).unwrap();
    let u = BTree::from_pages(&img).unwrap();
    u.check_invariants().unwrap();
    assert_eq!(u.entries(), t.entries());
    assert_eq!(u.height(), t.height());
    assert_eq!(t.to_pages(64).map(|_| ()), Err(PageError::Full));
}

/** @id TEST-BT-010 @verifies REQ-BT-010 */
#[test]
fn test_bt_010_order_too_small() {
    assert!(matches!(BTree::new(2), Err(BTreeError::OrderTooSmall)));
    assert!(matches!(BTree::new(0), Err(BTreeError::OrderTooSmall)));
    assert!(BTree::new(3).is_ok());
}

/** @id TEST-BT-012 @verifies REQ-BT-012 */
#[test]
fn test_bt_012_hostile_image_rejected() {
    use pagefmt::Page;
    let mut t = BTree::new(3).unwrap();
    for i in 0..20 {
        t.insert(&k(i), b"v");
    }
    let internal = |first: u64, second: u64| {
        let mut p = Page::new(256);
        p.insert(&[1u8]).unwrap();
        p.insert(&first.to_le_bytes()).unwrap();
        let mut c = second.to_le_bytes().to_vec();
        c.extend(b"k00005");
        p.insert(&c).unwrap();
        p
    };
    let mut img = t.to_pages(256).unwrap();
    let root = img.root;
    img.pages[root] = internal(9999, 0);
    assert!(matches!(BTree::from_pages(&img), Err(BTreeError::BadPage)));
    let mut img = t.to_pages(256).unwrap();
    img.pages[root] = internal(root as u64, root as u64);
    assert!(matches!(BTree::from_pages(&img), Err(BTreeError::BadPage)));
}

/** @id TEST-BT-011 @verifies REQ-BT-011 */
#[test]
fn test_bt_011_last_entry() {
    let mut t = BTree::new(3).unwrap();
    assert_eq!(t.last(), None);
    for i in 0..50 {
        t.insert(&k(i), &[i as u8]);
    }
    assert_eq!(t.last().unwrap(), (&k(49)[..], &[49u8][..]));
    t.remove(&k(49));
    assert_eq!(t.last().unwrap().0, &k(48)[..]);
    for i in 0..49 {
        t.remove(&k(i));
    }
    assert_eq!(t.last(), None);
}

/** @id TEST-BT-013 @verifies REQ-BT-013 */
#[test]
fn test_bt_013_bad_page_size_is_error() {
    let mut t = BTree::new(4).unwrap();
    t.insert(b"a", b"1");
    assert_eq!(t.to_pages(0).map(|_| ()), Err(PageError::BadSize));
    assert_eq!(t.to_pages(8).map(|_| ()), Err(PageError::BadSize));
    assert_eq!(t.to_pages(70000).map(|_| ()), Err(PageError::BadSize));
}
