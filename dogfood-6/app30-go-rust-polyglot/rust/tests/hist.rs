use metrics_core::hist::{bucket_bounds, bucket_index, HistError, Histogram};

fn lcg(seed: &mut u64) -> u64 {
    *seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    *seed >> 20
}

// @id TEST-HIST-001
// @verifies REQ-HIST-001
#[test]
fn test_hist_001_bucket_index() {
    assert_eq!(bucket_index(0), 0);
    assert_eq!(bucket_index(7), 7);
    assert_eq!(bucket_index(8), 8);
    assert_eq!(bucket_index(17), 16);
    assert_eq!(bucket_index(1000), 63);
    assert_eq!(bucket_index(u64::MAX), 495);
}

// @id TEST-HIST-002
// @verifies REQ-HIST-002
#[test]
fn test_hist_002_bounds_contiguous() {
    for i in 0..495usize {
        let (lo, hi) = bucket_bounds(i);
        let (nlo, _) = bucket_bounds(i + 1);
        assert!(lo <= hi, "bucket {i}");
        assert_eq!(hi + 1, nlo, "gap after bucket {i}");
        assert_eq!(bucket_index(lo), i);
        assert_eq!(bucket_index(hi), i);
    }
    assert_eq!(bucket_bounds(495).1, u64::MAX);
}

// @id TEST-HIST-003
// @verifies REQ-HIST-003
#[test]
fn test_hist_003_vectors() {
    let text = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../contract/vectors.tsv")).unwrap();
    let mut rows = 0;
    for line in text.lines() {
        let p: Vec<u64> = line.split('\t').map(|x| x.parse().unwrap()).collect();
        assert_eq!(bucket_index(p[0]) as u64, p[1], "index of {}", p[0]);
        assert_eq!(bucket_bounds(p[1] as usize), (p[2], p[3]));
        rows += 1;
    }
    assert!(rows >= 10);
}

// @id TEST-HIST-004
// @verifies REQ-HIST-004
#[test]
fn test_hist_004_record() {
    let mut h = Histogram::new();
    assert_eq!((h.count(), h.min(), h.max()), (0, None, None));
    h.record(10);
    h.record(3);
    h.record(u64::MAX);
    assert_eq!(h.count(), 3);
    assert_eq!(h.min(), Some(3));
    assert_eq!(h.max(), Some(u64::MAX));
    assert_eq!(h.sum(), u64::MAX);
}

// @id TEST-HIST-005
// @verifies REQ-HIST-005
#[test]
fn test_hist_005_record_zero_n() {
    let mut h = Histogram::new();
    h.record_n(99, 0);
    assert_eq!(h, Histogram::new());
    h.record_n(5, 3);
    assert_eq!((h.count(), h.sum()), (3, 15));
}

// @id TEST-HIST-006
// @verifies REQ-HIST-006
#[test]
fn test_hist_006_merge_order_independent() {
    let mut seed = 7u64;
    let mut parts = Vec::new();
    for _ in 0..4 {
        let mut h = Histogram::new();
        for _ in 0..200 {
            h.record(lcg(&mut seed) % 100_000);
        }
        parts.push(h);
    }
    let mut a = Histogram::new();
    for p in &parts {
        a.merge(p);
    }
    let mut b = Histogram::new();
    for p in parts.iter().rev() {
        b.merge(p);
    }
    let mut left = parts[0].clone();
    left.merge(&parts[1]);
    let mut right = parts[2].clone();
    right.merge(&parts[3]);
    left.merge(&right);
    assert_eq!(a, b);
    assert_eq!(a, left);
    assert_eq!(a.count(), 800);
    let mut e = Histogram::new();
    e.merge(&Histogram::new());
    assert_eq!(e, Histogram::new());
}

// @id TEST-HIST-007
// @verifies REQ-HIST-007
#[test]
fn test_hist_007_quantile() {
    let mut h = Histogram::new();
    assert_eq!(h.quantile(0.5), Ok(None));
    for v in 1..=100u64 {
        h.record(v);
    }
    assert_eq!(h.quantile(0.0), Ok(Some(1)));
    assert_eq!(h.quantile(0.5), Ok(Some(51)));
    assert_eq!(h.quantile(1.0), Ok(Some(100)));
    let p99 = h.quantile(0.99).unwrap().unwrap();
    assert!((99..=100).contains(&p99));
    assert_eq!(h.quantile(-0.1), Err(HistError::BadQuantile));
    assert_eq!(h.quantile(1.1), Err(HistError::BadQuantile));
    assert_eq!(h.quantile(f64::NAN), Err(HistError::BadQuantile));
}

// @id TEST-HIST-008
// @verifies REQ-HIST-008
#[test]
fn test_hist_008_codec() {
    let mut h = Histogram::new();
    for v in [0u64, 5, 5, 1_000_000, u64::MAX, 77] {
        h.record(v);
    }
    let bytes = h.encode();
    assert_eq!(Histogram::decode(&bytes), Ok(h.clone()));
    assert_eq!(Histogram::decode(&Histogram::new().encode()), Ok(Histogram::new()));
    for cut in 0..bytes.len() {
        assert!(Histogram::decode(&bytes[..cut]).is_err(), "cut {cut}");
    }
    // two entries with index delta 0 (duplicate index)
    assert_eq!(Histogram::decode(&[2, 3, 1, 0, 1]), Err(HistError::Corrupt));
    // index 496 is out of range
    assert_eq!(Histogram::decode(&[1, 0xF0, 0x03, 1]), Err(HistError::Corrupt));
    // min greater than max in the trailer
    assert_eq!(Histogram::decode(&[1, 0, 1, 5, 9, 3]), Err(HistError::Corrupt));
    // trailing garbage
    let mut extra = bytes.clone();
    extra.push(0);
    assert!(Histogram::decode(&extra).is_err());
}

// @id TEST-HIST-009
// @verifies REQ-HIST-009
#[test]
fn test_hist_009_count_saturates() {
    let mut h = Histogram::new();
    h.record_n(5, u64::MAX);
    h.record_n(5, 10);
    h.record(6);
    assert_eq!(h.count(), u64::MAX);
    assert_eq!(h.sum(), u64::MAX);
}
