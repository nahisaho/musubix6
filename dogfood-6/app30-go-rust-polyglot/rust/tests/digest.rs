use metrics_core::digest::{DigestError, TDigest};

fn uniform(d: &mut TDigest, n: u64) {
    // deterministic shuffle of 0..n by a coprime stride
    let stride = 7919u64;
    for k in 0..n {
        let x = (k * stride) % n;
        d.add(x as f64, 1.0).unwrap();
    }
}

// @id TEST-DIGEST-001
// @verifies REQ-DIGEST-001
#[test]
fn test_digest_001_new_validates() {
    assert!(matches!(TDigest::new(19.9), Err(DigestError::BadCompression)));
    assert!(matches!(TDigest::new(10000.1), Err(DigestError::BadCompression)));
    assert!(matches!(TDigest::new(f64::NAN), Err(DigestError::BadCompression)));
    assert!(matches!(TDigest::new(f64::INFINITY), Err(DigestError::BadCompression)));
    assert!(TDigest::new(20.0).is_ok());
    assert!(TDigest::new(10000.0).is_ok());
}

// @id TEST-DIGEST-002
// @verifies REQ-DIGEST-002
#[test]
fn test_digest_002_add_rejects_bad_input() {
    let mut d = TDigest::new(100.0).unwrap();
    d.add(1.0, 2.0).unwrap();
    for (x, w) in [(f64::NAN, 1.0), (f64::INFINITY, 1.0), (1.0, 0.0), (1.0, -1.0), (1.0, f64::NAN), (1.0, f64::INFINITY)] {
        assert_eq!(d.add(x, w), Err(DigestError::BadInput), "{x} {w}");
    }
    assert_eq!(d.total_weight(), 2.0);
    assert_eq!(d.quantile(0.5), Ok(Some(1.0)));
}

// @id TEST-DIGEST-003
// @verifies REQ-DIGEST-003
#[test]
fn test_digest_003_total_weight() {
    let mut d = TDigest::new(50.0).unwrap();
    let mut expect = 0.0;
    for k in 0..5000u64 {
        let w = (k % 5 + 1) as f64;
        d.add(k as f64, w).unwrap();
        expect += w;
    }
    assert_eq!(d.total_weight(), expect);
    let _ = d.centroids();
    assert_eq!(d.total_weight(), expect);
    let mut e = TDigest::new(50.0).unwrap();
    e.add(1.0, 3.0).unwrap();
    d.merge(&e);
    assert_eq!(d.total_weight(), expect + 3.0);
}

// @id TEST-DIGEST-004
// @verifies REQ-DIGEST-004
#[test]
fn test_digest_004_centroid_bound() {
    for delta in [20.0, 100.0, 500.0] {
        let mut d = TDigest::new(delta).unwrap();
        uniform(&mut d, 100_000);
        let n = d.centroids().len();
        assert!(n as f64 <= 2.0 * delta, "delta {delta}: {n} centroids");
        assert!(n >= 10);
    }
}

// @id TEST-DIGEST-005
// @verifies REQ-DIGEST-005
#[test]
fn test_digest_005_centroid_invariants() {
    let mut d = TDigest::new(100.0).unwrap();
    uniform(&mut d, 20_000);
    let cs = d.centroids();
    let mut sum = 0.0;
    for w in cs.windows(2) {
        assert!(w[0].0 <= w[1].0, "unsorted means");
    }
    for c in &cs {
        assert!(c.1 > 0.0);
        sum += c.1;
    }
    assert_eq!(sum, d.total_weight());
}

// @id TEST-DIGEST-006
// @verifies REQ-DIGEST-006
#[test]
fn test_digest_006_quantile_edges() {
    let mut d = TDigest::new(100.0).unwrap();
    assert_eq!(d.quantile(0.5), Ok(None));
    uniform(&mut d, 10_000);
    assert_eq!(d.quantile(0.0), Ok(Some(0.0)));
    assert_eq!(d.quantile(1.0), Ok(Some(9999.0)));
    assert_eq!(d.quantile(-1e-9), Err(DigestError::BadQuantile));
    assert_eq!(d.quantile(1.0 + 1e-9), Err(DigestError::BadQuantile));
    assert_eq!(d.quantile(f64::NAN), Err(DigestError::BadQuantile));
}

// @id TEST-DIGEST-007
// @verifies REQ-DIGEST-007
#[test]
fn test_digest_007_monotone() {
    let mut d = TDigest::new(60.0).unwrap();
    uniform(&mut d, 30_000);
    let mut prev = f64::MIN;
    for i in 0..=2000 {
        let q = i as f64 / 2000.0;
        let v = d.quantile(q).unwrap().unwrap();
        assert!(v >= prev, "q {q}: {v} < {prev}");
        assert!((0.0..=29_999.0).contains(&v));
        prev = v;
    }
}

// @id TEST-DIGEST-008
// @verifies REQ-DIGEST-008
#[test]
fn test_digest_008_accuracy() {
    let n = 100_000u64;
    let mut d = TDigest::new(100.0).unwrap();
    uniform(&mut d, n);
    for &q in &[0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99] {
        let est = d.quantile(q).unwrap().unwrap();
        assert!((est / n as f64 - q).abs() <= 0.01, "q {q}: est {est}");
    }
    for &q in &[0.0001, 0.001, 0.999, 0.9999] {
        let est = d.quantile(q).unwrap().unwrap();
        assert!((est / n as f64 - q).abs() <= 0.002, "tail q {q}: est {est}");
    }
}

// @id TEST-DIGEST-009
// @verifies REQ-DIGEST-009
#[test]
fn test_digest_009_merge() {
    let n = 60_000u64;
    let mut a = TDigest::new(100.0).unwrap();
    let mut b = TDigest::new(100.0).unwrap();
    for k in 0..n {
        let x = ((k * 7919) % n) as f64;
        if k % 2 == 0 { a.add(x, 1.0).unwrap() } else { b.add(x + 100_000.0, 1.0).unwrap() }
    }
    let wa = a.total_weight();
    a.merge(&TDigest::new(100.0).unwrap());
    assert_eq!(a.total_weight(), wa);
    a.merge(&b);
    assert_eq!(a.total_weight(), n as f64);
    assert_eq!(a.quantile(0.0), Ok(Some(0.0)));
    assert_eq!(a.quantile(1.0), Ok(Some(159_999.0)));
    // exactly half the weight lies below 100000
    let med = a.quantile(0.5).unwrap().unwrap();
    assert!(med >= 59_000.0 && med <= 101_000.0, "median {med}");
    let mut empty = TDigest::new(100.0).unwrap();
    empty.merge(&b);
    assert_eq!(empty.total_weight(), b.total_weight());
    assert_eq!(empty.quantile(1.0), Ok(Some(159_999.0)));
}

// @id TEST-DIGEST-010
// @verifies REQ-DIGEST-010
#[test]
fn test_digest_010_cdf() {
    let mut d = TDigest::new(100.0).unwrap();
    assert_eq!(d.cdf(1.0), None);
    uniform(&mut d, 50_000);
    assert_eq!(d.cdf(-5.0), Some(0.0));
    assert_eq!(d.cdf(49_999.0), Some(1.0));
    assert_eq!(d.cdf(1e12), Some(1.0));
    let mut prev = 0.0;
    for i in 0..=1000 {
        let c = d.cdf(i as f64 * 50.0).unwrap();
        assert!(c >= prev);
        prev = c;
    }
    for &q in &[0.05, 0.3, 0.5, 0.8, 0.95] {
        let x = d.quantile(q).unwrap().unwrap();
        assert!((d.cdf(x).unwrap() - q).abs() <= 0.02, "q {q}");
    }
}

// @id TEST-DIGEST-011
// @verifies REQ-DIGEST-011
#[test]
fn test_digest_011_degenerate() {
    let mut d = TDigest::new(100.0).unwrap();
    d.add(42.5, 1.0).unwrap();
    for q in [0.0, 0.3, 1.0] {
        assert_eq!(d.quantile(q), Ok(Some(42.5)));
    }
    let mut e = TDigest::new(100.0).unwrap();
    for _ in 0..5000 {
        e.add(-7.0, 1.0).unwrap();
    }
    for q in [0.0, 0.001, 0.5, 0.999, 1.0] {
        assert_eq!(e.quantile(q), Ok(Some(-7.0)));
    }
}

// @id TEST-DIGEST-012
// @verifies REQ-DIGEST-012
#[test]
fn test_digest_012_tail_centroids_small() {
    let mut d = TDigest::new(100.0).unwrap();
    uniform(&mut d, 100_000);
    let cs = d.centroids();
    let limit = d.total_weight() / 100.0 / 5.0;
    assert!(cs.first().unwrap().1 <= limit, "first {}", cs.first().unwrap().1);
    assert!(cs.last().unwrap().1 <= limit, "last {}", cs.last().unwrap().1);
}
