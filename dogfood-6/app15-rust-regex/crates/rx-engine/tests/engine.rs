use rx_engine::{Error, Regex};
use rx_syntax::ErrorKind;

fn re(p: &str) -> Regex {
    Regex::new(p).unwrap()
}

fn spans(p: &str, s: &str) -> Vec<(usize, usize)> {
    re(p).find_all(s).iter().map(|m| (m.start(), m.end())).collect()
}

/** @id TEST-ENGINE-001 @verifies REQ-ENGINE-001 */
#[test]
fn test_engine_001_construction_errors() {
    match Regex::new("a(") {
        Err(Error::Parse(e)) => assert_eq!(e.kind, ErrorKind::UnclosedGroup),
        other => panic!("{other:?}"),
    }
    assert!(matches!(Regex::new("(a{1000}){1000}"), Err(Error::Compile(_))));
    assert!(Regex::new("a{1000}").is_ok());
}

/** @id TEST-ENGINE-002 @verifies REQ-ENGINE-002 */
#[test]
fn test_engine_002_find() {
    let r = re("b+");
    let m = r.find("aabbbc").unwrap();
    assert_eq!((m.start(), m.end(), m.as_str()), (2, 5, "bbb"));
    assert!(r.find("aaa").is_none());
    assert_eq!(re("a|ab").find("ab").unwrap().as_str(), "a");
    assert_eq!(re("é+").find("xééy").unwrap().range(), 1..5);
}

/** @id TEST-ENGINE-003 @verifies REQ-ENGINE-003 */
#[test]
fn test_engine_003_is_match_vs_full() {
    let r = re("a|ab");
    assert!(r.is_match("xxab") && !r.is_match("xx"));
    assert!(r.full_match("ab") && r.full_match("a") && !r.full_match("abc") && !r.full_match(""));
    assert!(re("").full_match("") && !re("").full_match("a") && re("").is_match("a"));
}

/** @id TEST-ENGINE-004 @verifies REQ-ENGINE-004 */
#[test]
fn test_engine_004_dfa_fast_path_parity() {
    assert!(re("(a|b)*c").uses_dfa());
    assert!(!re("^a").uses_dfa());
    assert!(!re("(a|b)*a(a|b){15}").uses_dfa());
    let inputs = ["", "a", "ab", "aab", "abc", "bbbc", "ac", "c"];
    for p in ["(a|b)*c", "^a", "a$", "(^|a)b?", "[a-c]*"] {
        let r = re(p);
        for s in inputs {
            assert_eq!(r.full_match(s), r.full_match_nfa(s), "{p} on {s:?}");
        }
    }
}

/** @id TEST-ENGINE-005 @verifies REQ-ENGINE-005 */
#[test]
fn test_engine_005_captures() {
    let r = re("(a)(b)?c");
    let c = r.captures("xac").unwrap();
    assert_eq!(c.len(), 3);
    assert_eq!(c.get(0).unwrap().as_str(), "ac");
    assert_eq!(c.get(1).unwrap().range(), 1..2);
    assert!(c.get(2).is_none());
    assert!(c.get(3).is_none());
    assert!(r.captures("xx").is_none());
}

/** @id TEST-ENGINE-006 @verifies REQ-ENGINE-006 */
#[test]
fn test_engine_006_find_all() {
    assert_eq!(spans("a", "banana"), vec![(1, 2), (3, 4), (5, 6)]);
    assert_eq!(spans("a*", "baaac"), vec![(0, 0), (1, 4), (5, 5)]);
    assert_eq!(spans("", "ab"), vec![(0, 0), (1, 1), (2, 2)]);
    assert_eq!(spans("aa", "aaaaa"), vec![(0, 2), (2, 4)]);
    assert!(spans("z", "abc").is_empty());
}

/** @id TEST-ENGINE-007 @verifies REQ-ENGINE-007 */
#[test]
fn test_engine_007_replace_templates() {
    let r = re("(\\w+)@(\\w+)");
    assert_eq!(r.replace_all("joe@site", "$2:$1"), "site:joe");
    assert_eq!(r.replace_all("joe@site", "${1}x $0 $$"), "joex joe@site $");
    assert_eq!(r.replace_all("joe@site", "[$3]"), "[]");
    assert_eq!(re("(a)|b").replace_all("ab", "<$1>"), "<a><>");
    assert_eq!(r.replace_all("joe@site", "$"), "$");
    assert_eq!(r.replace_all("joe@site", "$-"), "$-");
}

/** @id TEST-ENGINE-008 @verifies REQ-ENGINE-008 */
#[test]
fn test_engine_008_replace_empty_matches() {
    assert_eq!(re("x*").replace_all("abc", "-"), "-a-b-c-");
    assert_eq!(re("b*").replace_all("abbc", "_"), "_a_c_");
    assert_eq!(re("z").replace_all("abc", "_"), "abc");
}

/** @id TEST-ENGINE-009 @verifies REQ-ENGINE-009 */
#[test]
fn test_engine_009_split() {
    assert_eq!(re(",\\s*").split("a, b,c"), vec!["a", "b", "c"]);
    assert_eq!(re(",").split(",a,"), vec!["", "a", ""]);
    assert_eq!(re(",").split("abc"), vec!["abc"]);
    assert_eq!(re(",").split(""), vec![""]);
}

/** @id TEST-ENGINE-010 @verifies REQ-ENGINE-010 */
#[test]
fn test_engine_010_captures_all() {
    let all = re("(\\d)(\\w)?").captures_all("1a 2 3c");
    let got: Vec<(String, Option<String>)> = all
        .iter()
        .map(|c| (c.get(1).unwrap().as_str().to_string(), c.get(2).map(|m| m.as_str().to_string())))
        .collect();
    assert_eq!(
        got,
        vec![("1".into(), Some("a".into())), ("2".into(), None), ("3".into(), Some("c".into()))]
    );
}

/** @id TEST-ENGINE-011 @verifies REQ-ENGINE-011 */
#[test]
fn test_engine_011_metadata() {
    let r = re("(a)(?:b)((c))");
    assert_eq!(r.group_count(), 3);
    assert_eq!(r.pattern(), "(a)(?:b)((c))");
    assert_eq!(re("x").group_count(), 0);
}

/** @id TEST-ENGINE-012 @verifies REQ-ENGINE-012 */
#[test]
fn test_engine_012_equivalence() {
    assert_eq!(re("(a|b)*").equivalent_to(&re("(a*b*)*")), Ok(true));
    assert_eq!(re("a+").equivalent_to(&re("a*")), Ok(false));
    assert_eq!(re("^a").equivalent_to(&re("a")), Err(Error::Unsupported));
    assert_eq!(re("a").equivalent_to(&re("a$")), Err(Error::Unsupported));
}

/** @id TEST-ENGINE-013 @verifies REQ-ENGINE-013 */
#[test]
fn test_engine_013_empty_match_multibyte() {
    let spans: Vec<_> = re("").find_all("é日").iter().map(|m| m.range()).collect();
    assert_eq!(spans, vec![0..0, 2..2, 5..5]);
    assert_eq!(re("x*").replace_all("日a", "-"), "-日-a-");
    assert_eq!(re("").split("éa"), vec!["", "é", "a", ""]);
}

/** @id TEST-ENGINE-014 @verifies REQ-ENGINE-014 */
#[test]
fn test_engine_014_multi_digit_groups() {
    let r = re("(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)");
    assert_eq!(r.replace_all("abcdefghij", "[$10]"), "[j]");
    assert_eq!(r.replace_all("abcdefghij", "[${1}0]"), "[a0]");
    assert_eq!(re("(a)").replace_all("a", "[$12]"), "[]");
}
