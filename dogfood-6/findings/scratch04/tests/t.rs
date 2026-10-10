use scratch04::f;
fn k(s: &str) -> Vec<i32> { f(s).into_iter().collect() }

/** @id TEST-A-001 @verifies REQ-A-001 */
#[test]
fn test_a_001_x() {
    assert_eq!(k("a"), vec![1]);
}

/** @id TEST-A-002 @verifies REQ-A-002 */
#[test]
fn test_a_002_x() {
    assert_eq!(
        k("a"),
        vec![1]
    );
}
