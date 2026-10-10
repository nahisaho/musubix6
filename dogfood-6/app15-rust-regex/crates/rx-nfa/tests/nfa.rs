use rx_nfa::{Nfa, NfaError, State};
use rx_syntax::parse;

fn nfa(p: &str) -> Nfa {
    Nfa::from_parsed(&parse(p).unwrap()).unwrap()
}
fn m(p: &str, s: &str) -> bool {
    nfa(p).is_match(s)
}

/** @id TEST-NFA-001 @verifies REQ-NFA-001 */
#[test]
fn test_nfa_001_single_match_state() {
    let n = nfa("(a)(b)|c");
    let matches = n.states.iter().filter(|s| matches!(s, State::Match)).count();
    assert_eq!(matches, 1);
    assert!(n.start < n.states.len());
    assert_eq!(n.groups, 2);
}

/** @id TEST-NFA-002 @verifies REQ-NFA-002 */
#[test]
fn test_nfa_002_consuming_states() {
    assert!(m("a", "a") && !m("a", "b") && !m("a", ""));
    assert!(m(".", "x") && m(".", "é") && !m(".", "\n"));
    assert!(m("[a-c]", "b") && !m("[a-c]", "d") && m("[^a-c]", "d"));
    let n = nfa("a");
    assert_eq!(n.states.iter().filter(|s| matches!(s, State::Class(..))).count(), 1);
}

/** @id TEST-NFA-003 @verifies REQ-NFA-003 */
#[test]
fn test_nfa_003_concat() {
    assert!(m("abc", "abc"));
    assert!(!m("abc", "ab") && !m("abc", "abcd") && !m("abc", "acb"));
}

/** @id TEST-NFA-004 @verifies REQ-NFA-004 */
#[test]
fn test_nfa_004_alt() {
    for s in ["a", "b", "cd"] {
        assert!(m("a|b|cd", s));
    }
    assert!(!m("a|b|cd", "c") && !m("a|b|cd", "ab"));
    assert!(m("a|", "") && m("a|", "a") && !m("a|", "aa"));
}

/** @id TEST-NFA-005 @verifies REQ-NFA-005 */
#[test]
fn test_nfa_005_star_plus_question() {
    assert!(m("a*", "") && m("a*", "aaa") && !m("a*", "b"));
    assert!(!m("a+", "") && m("a+", "a") && m("a+", "aaaa"));
    assert!(m("a?", "") && m("a?", "a") && !m("a?", "aa"));
    assert!(m("(a*)*", "aaa") && m("(a*)*", "") && !m("(a*)*b", "aaa"));
    assert!(m("(a|)+", "aaa") && m("(a|)+", ""));
    assert!(m("(a*)+$", "aa"));
}

/** @id TEST-NFA-006 @verifies REQ-NFA-006 */
#[test]
fn test_nfa_006_counted() {
    assert!(!m("a{2,4}", "a") && m("a{2,4}", "aa") && m("a{2,4}", "aaaa") && !m("a{2,4}", "aaaaa"));
    assert!(m("a{3}", "aaa") && !m("a{3}", "aa") && !m("a{3}", "aaaa"));
    assert!(m("a{2,}", "aaaaaaa") && !m("a{2,}", "a"));
    assert!(m("(ab){0}", "") && !m("(ab){0}", "ab"));
    assert!(m("a{0,0}b", "b"));
}

/** @id TEST-NFA-007 @verifies REQ-NFA-007 */
#[test]
fn test_nfa_007_size_limit() {
    let p = parse("((a{100}){100}){100}").unwrap();
    assert_eq!(Nfa::from_parsed(&p).unwrap_err(), NfaError::TooBig);
    let ok = parse("(a{100}){100}").unwrap();
    assert!(Nfa::from_parsed(&ok).is_ok());
}

/** @id TEST-NFA-008 @verifies REQ-NFA-008 */
#[test]
fn test_nfa_008_closure() {
    let n = nfa("(a*)*b");
    let c = n.eps_closure(&[n.start], true, false);
    assert!(c.windows(2).all(|w| w[0] < w[1]));
    assert!(c.contains(&n.start));
    let classes = c.iter().filter(|&&i| matches!(n.states[i], State::Class(..))).count();
    assert_eq!(classes, 2);
    let a = nfa("^a");
    let at0 = a.eps_closure(&[a.start], true, false);
    let not0 = a.eps_closure(&[a.start], false, false);
    assert!(at0.len() > not0.len());
}

/** @id TEST-NFA-009 @verifies REQ-NFA-009 */
#[test]
fn test_nfa_009_anchors() {
    assert!(m("^a$", "a") && !m("^a$", "ab"));
    assert!(!m("a^", "a") && !m("$a", "a"));
    assert!(m("^$", "") && m("^", "") && m("$", "") && !m("^", "a"));
    assert!(m("a|^b", "b") && m("(^|x)a", "xa") && m("(^|x)a", "a"));
}

/** @id TEST-NFA-010 @verifies REQ-NFA-010 */
#[test]
fn test_nfa_010_invariants() {
    for p in ["a", "ab|cd*", "(a|b)*c+", "((a?)*)+", "[a-z]+@[a-z]+\\.com", "(?:x|y|z)*"] {
        let n = nfa(p);
        n.validate().unwrap();
        assert!(n.states.len() <= 2 * p.chars().count() + 2, "{p}: {}", n.states.len());
    }
}

/** @id TEST-NFA-011 @verifies REQ-NFA-011 */
#[test]
fn test_nfa_011_save_states() {
    let n = nfa("(a)(b)");
    let slots: Vec<usize> = n
        .states
        .iter()
        .filter_map(|s| if let State::Save(slot, _) = s { Some(*slot) } else { None })
        .collect();
    let mut sorted = slots.clone();
    sorted.sort();
    assert_eq!(sorted, vec![2, 3, 4, 5]);
    assert!(n.is_match("ab") && !n.is_match("a"));
}

/** @id TEST-NFA-012 @verifies REQ-NFA-012 */
#[test]
fn test_nfa_012_unicode_and_linear() {
    assert!(m("é+€", "ééé€") && m(".{3}", "日本語") && !m(".{3}", "日本"));
    let n = nfa("(a?){30}a{30}");
    assert!(n.is_match(&"a".repeat(30)));
    assert!(!n.is_match(&"a".repeat(61)));
}
