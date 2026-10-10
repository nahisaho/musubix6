use scratch04::shapes::{area, Circle};
use scratch04::names::label;

/** @id TEST-A-003 @verifies REQ-A-003 */
#[test]
fn test_a_003_area() {
    let c = Circle::new(2);
    assert_eq!(area(&c), 12);
}

/** @id TEST-A-004 @verifies REQ-A-004 */
#[test]
fn test_a_004_label() {
    assert_eq!(label("x", 3), "x3".to_string());
    assert!(label("y", 1).is_empty() == false);
}
