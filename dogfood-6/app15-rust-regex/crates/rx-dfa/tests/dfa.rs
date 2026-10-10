use rx_dfa::{Dfa, DfaError};
use rx_nfa::Nfa;
use rx_syntax::parse;

fn dfa(p: &str) -> Dfa {
    Dfa::from_nfa(&Nfa::from_parsed(&parse(p).unwrap()).unwrap()).unwrap()
}

fn all_strings(alpha: &[char], max: usize) -> Vec<String> {
    let mut out = vec![String::new()];
    let mut frontier = vec![String::new()];
    for _ in 0..max {
        let mut next = Vec::new();
        for s in &frontier {
            for c in alpha {
                next.push(format!("{s}{c}"));
            }
        }
        out.extend(next.iter().cloned());
        frontier = next;
    }
    out
}

/** @id TEST-DFA-001 @verifies REQ-DFA-001 */
#[test]
fn test_dfa_001_alphabet_partition() {
    let d = dfa("[a-c]x");
    assert_eq!(d.bounds(), &[0, 97, 100, 120, 121]);
    assert_eq!(d.num_classes(), 5);
    assert_eq!(d.class_of('b'), 1);
    assert_eq!(d.class_of('x'), 3);
    assert_eq!(d.class_of('\u{10FFFF}'), 4);
    assert_eq!(d.class_of('\0'), 0);
}

/** @id TEST-DFA-002 @verifies REQ-DFA-002 */
#[test]
fn test_dfa_002_complete_with_dead_state() {
    let d = dfa("a");
    assert_eq!(d.num_states(), 3);
    for s in 0..d.num_states() {
        for c in 0..d.num_classes() {
            assert!(d.next_state(s, c) < d.num_states());
        }
    }
    let dead = d.next_state(d.start(), d.class_of('z'));
    assert!(!d.is_accepting(dead));
    for c in 0..d.num_classes() {
        assert_eq!(d.next_state(dead, c), dead);
    }
}

/** @id TEST-DFA-003 @verifies REQ-DFA-003 */
#[test]
fn test_dfa_003_agrees_with_nfa() {
    let inputs = all_strings(&['a', 'b', 'c'], 5);
    for p in ["(a|b)*c", "a(b|c)*", "(ab|a)(bc|c)?", "[^a]b*", "(a*b*)*c?", "a{2,3}b{0,1}", ".*"] {
        let n = Nfa::from_parsed(&parse(p).unwrap()).unwrap();
        let d = Dfa::from_nfa(&n).unwrap();
        for s in &inputs {
            assert_eq!(d.is_match(s), n.is_match(s), "{p} on {s:?}");
        }
    }
}

/** @id TEST-DFA-004 @verifies REQ-DFA-004 */
#[test]
fn test_dfa_004_anchors_unsupported() {
    for p in ["^a", "a$", "(^|a)b"] {
        let n = Nfa::from_parsed(&parse(p).unwrap()).unwrap();
        assert_eq!(Dfa::from_nfa(&n).unwrap_err(), DfaError::Unsupported, "{p}");
    }
}

/** @id TEST-DFA-005 @verifies REQ-DFA-005 */
#[test]
fn test_dfa_005_state_limit() {
    let big = Nfa::from_parsed(&parse("(a|b)*a(a|b){15}").unwrap()).unwrap();
    assert_eq!(Dfa::from_nfa(&big).unwrap_err(), DfaError::TooManyStates);
    let small = Nfa::from_parsed(&parse("(a|b)*a(a|b){5}").unwrap()).unwrap();
    assert!(Dfa::from_nfa(&small).unwrap().num_states() >= 64);
}

/** @id TEST-DFA-006 @verifies REQ-DFA-006 */
#[test]
fn test_dfa_006_hopcroft_merges() {
    let d = dfa("a(b|c)|d(b|c)");
    assert_eq!(d.num_states(), 5);
    let m = d.minimize();
    assert_eq!(m.num_states(), 4);
    assert_eq!(dfa("(a|b)*abb").minimize().num_states(), 5);
    assert_eq!(dfa("a*").minimize().num_states(), 2);
}

/** @id TEST-DFA-007 @verifies REQ-DFA-007 */
#[test]
fn test_dfa_007_idempotent_and_preserving() {
    let inputs = all_strings(&['a', 'b', 'd'], 4);
    for p in ["a(b|c)|d(b|c)", "(a|b)*abb", "(a*b*)*", "a{2,4}|b", "(ab|a)(bc|c)?"] {
        let d = dfa(p);
        let m = d.minimize();
        assert_eq!(m.minimize(), m, "{p}");
        for s in &inputs {
            assert_eq!(m.is_match(s), d.is_match(s), "{p} on {s:?}");
        }
    }
}

/** @id TEST-DFA-008 @verifies REQ-DFA-008 */
#[test]
fn test_dfa_008_canonical_and_equivalent() {
    let a = dfa("(a|b)*").minimize();
    let b = dfa("(a*b*)*").minimize();
    assert_eq!(a, b);
    assert!(dfa("(a|b)*").equivalent(&dfa("(a*b*)*")));
    assert!(dfa("a+").equivalent(&dfa("aa*")));
    assert!(!dfa("a*").equivalent(&dfa("a+")));
    assert!(!dfa("[ab]").equivalent(&dfa("[ac]")));
    assert!(dfa("a|b|c").equivalent(&dfa("[a-c]")));
    assert_eq!(dfa("a|b|c").minimize(), dfa("[a-c]").minimize());
    assert_eq!(dfa("a|b|c").minimize().bounds(), &[0, 97, 100]);
}

/** @id TEST-DFA-009 @verifies REQ-DFA-009 */
#[test]
fn test_dfa_009_algebra() {
    let c = dfa("a{2}").complement();
    let i = dfa("a*").intersect(&c);
    for (s, want) in [("", true), ("a", true), ("aa", false), ("aaa", true), ("b", false)] {
        assert_eq!(i.is_match(s), want, "{s:?}");
    }
    assert!(dfa("a+").intersect(&dfa("b+")).is_empty());
    assert!(!dfa("a*").intersect(&dfa("(aa)*")).is_empty());
    let cc = dfa("ab").complement().complement();
    assert!(cc.equivalent(&dfa("ab")));
    assert!(dfa("a").complement().is_match("") && !dfa("a").complement().is_match("a"));
}

/** @id TEST-DFA-010 @verifies REQ-DFA-010 */
#[test]
fn test_dfa_010_shortest_and_representative() {
    assert_eq!(dfa("a{3}|b{2}").shortest_match().as_deref(), Some("bb"));
    assert_eq!(dfa("x*").shortest_match().as_deref(), Some(""));
    assert_eq!(dfa("a+").intersect(&dfa("b+")).shortest_match(), None);
    assert_eq!(dfa("ab|ba").shortest_match().as_deref(), Some("ab"));
    let d = dfa("[^\u{D7FF}\u{E000}]");
    let gap = d.bounds().iter().position(|&b| b == 0xD800).unwrap();
    assert_eq!(d.representative(gap), None);
    let e = d.bounds().iter().position(|&b| b == 0xE000).unwrap();
    assert_eq!(d.representative(e), Some('\u{E000}'));
    assert_eq!(d.representative(0), Some('\0'));
}

/** @id TEST-DFA-011 @verifies REQ-DFA-011 */
#[test]
fn test_dfa_011_linear_scan() {
    let d = dfa("(a|é)*c");
    let long = format!("{}c", "aé".repeat(100_000));
    assert!(d.is_match(&long));
    assert!(!d.is_match(&long[..long.len() - 1]));
}

/** @id TEST-DFA-012 @verifies REQ-DFA-012 */
#[test]
fn test_dfa_012_live_states() {
    let m = dfa("a(b|c)|d(b|c)").minimize();
    let live = m.live_states();
    assert_eq!(live.len(), 3);
    let dead = (0..m.num_states()).find(|s| !live.contains(s)).unwrap();
    assert!(!m.is_accepting(dead));
    assert!(live.contains(&m.start()));
}
