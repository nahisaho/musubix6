use d::Tree;

/** @id TEST-D-001 @verifies REQ-D-001 */
#[test]
fn test_d_001_empty() {
    let mut t = Tree::new(4).unwrap();
    assert_eq!(t.insert(1, 2), None);
    assert_eq!(t.get(1), Some(2));
}
