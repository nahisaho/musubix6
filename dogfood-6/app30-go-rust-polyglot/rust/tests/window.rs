use metrics_core::window::{Aggregator, Observed, WindowError, WindowSpec};

fn spec(size: i64, slide: i64) -> WindowSpec {
    WindowSpec::new(size, slide).unwrap()
}

fn starts(ws: &[metrics_core::window::ClosedWindow]) -> Vec<i64> {
    ws.iter().map(|w| w.start).collect()
}

// @id TEST-WINDOW-001
// @verifies REQ-WINDOW-001
#[test]
fn test_window_001_spec_validation() {
    for (size, slide) in [(0, 1), (1, 0), (-5, 5), (5, -5), (5, 10), (10, 3), (i64::MIN, 1)] {
        assert_eq!(WindowSpec::new(size, slide), Err(WindowError::BadSpec), "{size},{slide}");
    }
    for (size, slide) in [(10, 5), (10, 10), (1, 1), (i64::MAX, 1)] {
        assert!(WindowSpec::new(size, slide).is_ok(), "{size},{slide}");
    }
}

// @id TEST-WINDOW-002
// @verifies REQ-WINDOW-002
#[test]
fn test_window_002_tumbling_starts() {
    let s = spec(10, 10);
    assert_eq!(s.window_starts(0), Ok(vec![0]));
    assert_eq!(s.window_starts(9), Ok(vec![0]));
    assert_eq!(s.window_starts(10), Ok(vec![10]));
    assert_eq!(s.window_starts(-1), Ok(vec![-10]));
    assert_eq!(s.window_starts(-10), Ok(vec![-10]));
    assert_eq!(s.window_starts(-11), Ok(vec![-20]));
}

// @id TEST-WINDOW-003
// @verifies REQ-WINDOW-003
#[test]
fn test_window_003_sliding_starts() {
    let s = spec(30, 10);
    assert_eq!(s.window_starts(25), Ok(vec![0, 10, 20]));
    assert_eq!(s.window_starts(5), Ok(vec![-20, -10, 0]));
    assert_eq!(s.window_starts(30), Ok(vec![10, 20, 30]));
    assert_eq!(s.window_starts(-1), Ok(vec![-30, -20, -10]));
    for ts in -100..100 {
        let v = s.window_starts(ts).unwrap();
        assert_eq!(v.len(), 3);
        for st in v {
            assert!(st % 10 == 0 && st <= ts && ts < st + 30, "ts {ts} start {st}");
        }
    }
}

// @id TEST-WINDOW-004
// @verifies REQ-WINDOW-004
#[test]
fn test_window_004_overflow() {
    let s = spec(10, 10);
    assert_eq!(s.window_starts(i64::MAX), Err(WindowError::Overflow));
    assert_eq!(s.window_starts(i64::MIN), Err(WindowError::Overflow));
    assert_eq!(spec(30, 10).window_starts(i64::MAX), Err(WindowError::Overflow));
    let mut a = Aggregator::new(s, 0);
    assert_eq!(a.observe(i64::MAX, 1), Err(WindowError::Overflow));
    assert_eq!(a.watermark(), None);
    assert_eq!(a.late_count(), 0);
    assert!(a.flush().is_empty());
}

// @id TEST-WINDOW-005
// @verifies REQ-WINDOW-005
#[test]
fn test_window_005_observe_updates() {
    let mut a = Aggregator::new(spec(10, 10), 100);
    a.observe(5, 3).unwrap();
    a.observe(7, 9).unwrap();
    a.observe(12, 1).unwrap();
    let ws = a.flush();
    assert_eq!(starts(&ws), vec![0, 10]);
    assert_eq!((ws[0].end, ws[0].count, ws[0].sum, ws[0].min, ws[0].max), (10, 2, 12, 3, 9));
    assert_eq!((ws[1].count, ws[1].sum, ws[1].min, ws[1].max), (1, 1, 1, 1));
    let mut b = Aggregator::new(spec(20, 10), 100);
    b.observe(15, 4).unwrap();
    let ws = b.flush();
    assert_eq!(starts(&ws), vec![0, 10]);
    assert!(ws.iter().all(|w| w.count == 1 && w.sum == 4));
}

// @id TEST-WINDOW-006
// @verifies REQ-WINDOW-006
#[test]
fn test_window_006_watermark() {
    let mut a = Aggregator::new(spec(10, 10), 30);
    assert_eq!(a.watermark(), None);
    a.observe(100, 1).unwrap();
    assert_eq!(a.watermark(), Some(70));
    a.observe(50, 1).unwrap();
    assert_eq!(a.watermark(), Some(70));
    a.observe(200, 1).unwrap();
    assert_eq!(a.watermark(), Some(170));
    let mut b = Aggregator::new(spec(1, 1), 10);
    b.observe(i64::MIN + 3, 1).unwrap();
    assert_eq!(b.watermark(), Some(i64::MIN));
}

// @id TEST-WINDOW-007
// @verifies REQ-WINDOW-007
#[test]
fn test_window_007_take_closed_once_in_order() {
    let mut a = Aggregator::new(spec(10, 10), 5);
    for ts in [1, 2, 11, 12] {
        a.observe(ts, 1).unwrap();
    }
    assert!(a.take_closed().is_empty());
    a.observe(18, 1).unwrap();
    assert_eq!(starts(&a.take_closed()), vec![0]);
    assert!(a.take_closed().is_empty());
    a.observe(40, 1).unwrap();
    assert_eq!(starts(&a.take_closed()), vec![10]);
    a.observe(300, 1).unwrap();
    assert_eq!(starts(&a.take_closed()), vec![40]);
}

// @id TEST-WINDOW-008
// @verifies REQ-WINDOW-008
#[test]
fn test_window_008_late_events() {
    let mut a = Aggregator::new(spec(10, 10), 0);
    assert_eq!(a.observe(25, 1), Ok(Observed::Accepted));
    assert_eq!(a.observe(3, 1), Ok(Observed::Late));
    assert_eq!(a.late_count(), 1);
    assert_eq!(starts(&a.flush()), vec![20]);

    let mut b = Aggregator::new(spec(20, 10), 0);
    assert_eq!(b.observe(35, 1), Ok(Observed::Accepted));
    assert_eq!(b.observe(15, 1), Ok(Observed::Late));
    assert_eq!(b.observe(25, 1), Ok(Observed::PartiallyLate));
    assert_eq!(b.late_count(), 1);
    let ws = b.flush();
    assert_eq!(starts(&ws), vec![20, 30]);
    assert_eq!(ws[0].count, 2);
    assert_eq!(ws[1].count, 1);
}

// @id TEST-WINDOW-009
// @verifies REQ-WINDOW-009
#[test]
fn test_window_009_flush() {
    let mut a = Aggregator::new(spec(10, 10), 100);
    assert!(a.flush().is_empty());
    for ts in [5, 25, 15] {
        a.observe(ts, 1).unwrap();
    }
    assert_eq!(starts(&a.flush()), vec![0, 10, 20]);
    assert_eq!(a.observe(7, 1), Ok(Observed::Late));
    assert_eq!(a.observe(29, 1), Ok(Observed::Late));
    assert_eq!(a.observe(31, 1), Ok(Observed::Accepted));
    assert_eq!(starts(&a.flush()), vec![30]);
    assert!(a.flush().is_empty());
}

// @id TEST-WINDOW-010
// @verifies REQ-WINDOW-010
#[test]
fn test_window_010_sparse() {
    let mut a = Aggregator::new(spec(10, 10), 0);
    a.observe(0, 1).unwrap();
    a.observe(25, 1).unwrap();
    assert_eq!(starts(&a.flush()), vec![0, 20]);
    let mut b = Aggregator::new(spec(10, 10), 0);
    b.observe(0, 1).unwrap();
    b.observe(10_000_000_000_000, 1).unwrap();
    assert_eq!(starts(&b.take_closed()), vec![0]);
    assert_eq!(starts(&b.flush()), vec![10_000_000_000_000]);
    let mut c = Aggregator::new(spec(30, 10), 0);
    c.observe(5, 1).unwrap();
    c.observe(10_000_000_000_000, 1).unwrap();
    assert_eq!(starts(&c.take_closed()), vec![-20, -10, 0]);
}

// @id TEST-WINDOW-011
// @verifies REQ-WINDOW-011
#[test]
fn test_window_011_hist_consistent() {
    let mut a = Aggregator::new(spec(60, 20), 50);
    let mut seed = 99u64;
    for i in 0..500i64 {
        seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        a.observe(i * 3 + (seed >> 60) as i64, seed >> 40).unwrap();
    }
    let mut ws = a.take_closed();
    ws.extend(a.flush());
    assert!(ws.len() > 10);
    for w in ws {
        assert_eq!(w.hist.count(), w.count);
        assert_eq!(w.hist.sum(), w.sum);
        assert_eq!(w.hist.min(), Some(w.min));
        assert_eq!(w.hist.max(), Some(w.max));
    }
}
