use pagefmt::{crc32, Page, PageError};

/** @id TEST-PAGE-001 @verifies REQ-PAGE-001 */
#[test]
fn test_page_001_crc32_check_value() {
    assert_eq!(crc32(b"123456789"), 0xCBF43926);
    assert_eq!(crc32(b""), 0);
}

/** @id TEST-PAGE-002 @verifies REQ-PAGE-002 */
#[test]
fn test_page_002_insert_get() {
    let mut p = Page::new(256);
    let a = p.insert(b"alpha").unwrap();
    let b = p.insert(b"beta").unwrap();
    assert_ne!(a, b);
    assert_eq!(p.get(a), Some(&b"alpha"[..]));
    assert_eq!(p.get(b), Some(&b"beta"[..]));
    assert_eq!(p.get(99), None);
}

/** @id TEST-PAGE-003 @verifies REQ-PAGE-003 */
#[test]
fn test_page_003_full_leaves_page_unchanged() {
    let mut p = Page::new(64);
    p.insert(b"abc").unwrap();
    let before = p.to_bytes();
    let big = vec![7u8; 64];
    assert_eq!(p.insert(&big), Err(PageError::Full));
    assert_eq!(p.to_bytes(), before);
}

/** @id TEST-PAGE-004 @verifies REQ-PAGE-004 */
#[test]
fn test_page_004_delete_reuses_slot() {
    let mut p = Page::new(128);
    let a = p.insert(b"one").unwrap();
    let _b = p.insert(b"two").unwrap();
    assert!(p.delete(a));
    assert_eq!(p.get(a), None);
    assert!(!p.delete(a));
    let c = p.insert(b"three").unwrap();
    assert_eq!(c, a);
    assert_eq!(p.get(c), Some(&b"three"[..]));
}

/** @id TEST-PAGE-005 @verifies REQ-PAGE-005 */
#[test]
fn test_page_005_compact_keeps_slots() {
    let mut p = Page::new(128);
    let s: Vec<u16> = (0..5).map(|i| p.insert(&[i as u8; 10]).unwrap()).collect();
    p.delete(s[1]);
    p.delete(s[3]);
    let free_before = p.free_space();
    p.compact();
    assert_eq!(p.free_space(), free_before + 20);
    assert_eq!(p.get(s[0]), Some(&[0u8; 10][..]));
    assert_eq!(p.get(s[2]), Some(&[2u8; 10][..]));
    assert_eq!(p.get(s[4]), Some(&[4u8; 10][..]));
    assert_eq!(p.get(s[1]), None);
}

/** @id TEST-PAGE-006 @verifies REQ-PAGE-006 */
#[test]
fn test_page_006_roundtrip() {
    let mut p = Page::new(128);
    let a = p.insert(b"x").unwrap();
    p.insert(b"yy").unwrap();
    p.delete(a);
    let bytes = p.to_bytes();
    assert_eq!(bytes.len(), 128);
    let q = Page::from_bytes(&bytes).unwrap();
    assert_eq!(q, p);
    assert_eq!(q.get(1), Some(&b"yy"[..]));
}

/** @id TEST-PAGE-007 @verifies REQ-PAGE-007 */
#[test]
fn test_page_007_bitflip_detected() {
    let mut p = Page::new(64);
    p.insert(b"hello").unwrap();
    let bytes = p.to_bytes();
    for i in 0..bytes.len() {
        for bit in 0..8 {
            let mut b = bytes.clone();
            b[i] ^= 1 << bit;
            assert_eq!(Page::from_bytes(&b), Err(PageError::Corrupt), "byte {i} bit {bit}");
        }
    }
}

/** @id TEST-PAGE-008 @verifies REQ-PAGE-008 */
#[test]
fn test_page_008_free_space_formula() {
    let mut p = Page::new(100);
    assert_eq!(p.free_space(), 100 - Page::HEADER - 4);
    let a = p.insert(&[1u8; 10]).unwrap();
    p.insert(&[2u8; 6]).unwrap();
    assert_eq!(p.free_space(), 100 - Page::HEADER - 4 - 2 * 4 - 16);
    p.delete(a);
    p.compact();
    assert_eq!(p.free_space(), 100 - Page::HEADER - 4 - 2 * 4 - 6);
}

/** @id TEST-PAGE-009 @verifies REQ-PAGE-009 */
#[test]
fn test_page_009_bad_size_is_error() {
    assert_eq!(Page::try_new(0), Err(PageError::BadSize));
    assert_eq!(Page::try_new(11), Err(PageError::BadSize));
    assert_eq!(Page::try_new(65536), Err(PageError::BadSize));
    assert!(Page::try_new(12).is_ok());
    assert!(Page::try_new(65535).is_ok());
}
