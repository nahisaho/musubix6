use scratch04::zed::zap;

/** @id TEST-A-009 @verifies REQ-A-999 */
#[test]
fn test_a_009_zap() {
    assert_eq!(zap(1), 2);
}

/** @id TEST-A-010 @verifies REQ-A-001 */
#[test]
fn test_a_010_zap_pt() {
    let p = scratch04::geo::Point { x: 1, y: 2 };
    assert_eq!(p.x, 1);
}
