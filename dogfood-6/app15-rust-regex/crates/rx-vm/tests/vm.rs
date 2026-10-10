use rx_syntax::parse;
use rx_vm::{compile, CompileError, Inst, Program};

fn prog(p: &str) -> Program {
    compile(&parse(p).unwrap()).unwrap()
}

type Caps = Vec<Option<(usize, usize)>>;

fn caps_at(p: &str, s: &str, at: usize) -> Option<Caps> {
    let pr = prog(p);
    let slots = pr.find_at(s, at)?;
    Some(slots.chunks(2).map(|c| c[0].zip(c[1])).collect())
}

fn caps(p: &str, s: &str) -> Option<Caps> {
    caps_at(p, s, 0)
}

fn span(p: &str, s: &str) -> Option<(usize, usize)> {
    caps(p, s).and_then(|c| c[0])
}

/** @id TEST-VM-001 @verifies REQ-VM-001 */
#[test]
fn test_vm_001_emits_chars() {
    let p = prog("ab");
    assert_eq!(p.insts, vec![Inst::Char('a'), Inst::Char('b'), Inst::Match]);
    assert_eq!(p.disassemble(), "0000 char 'a'\n0001 char 'b'\n0002 match\n");
    assert_eq!(prog("").insts, vec![Inst::Match]);
}

/** @id TEST-VM-002 @verifies REQ-VM-002 */
#[test]
fn test_vm_002_alternation_priority() {
    let d = prog("a|b").disassemble();
    assert_eq!(d, "0000 split 1, 3\n0001 char 'a'\n0002 jmp 4\n0003 char 'b'\n0004 match\n");
    assert_eq!(span("a|ab", "ab"), Some((0, 1)));
    assert_eq!(span("ab|a", "ab"), Some((0, 2)));
    assert_eq!(span("a||b", "b"), Some((0, 0)));
}

/** @id TEST-VM-003 @verifies REQ-VM-003 */
#[test]
fn test_vm_003_greedy_and_lazy_star() {
    assert_eq!(prog("a*").disassemble(), "0000 split 1, 3\n0001 char 'a'\n0002 jmp 0\n0003 match\n");
    assert_eq!(prog("a*?").disassemble(), "0000 split 3, 1\n0001 char 'a'\n0002 jmp 0\n0003 match\n");
    assert_eq!(span("a*", "aaa"), Some((0, 3)));
    assert_eq!(span("a*?", "aaa"), Some((0, 0)));
    assert_eq!(span("a+?", "aaa"), Some((0, 1)));
    assert_eq!(span("a??", "a"), Some((0, 0)));
    assert_eq!(span("<.*?>", "<a><b>"), Some((0, 3)));
    assert_eq!(span("<.*>", "<a><b>"), Some((0, 6)));
}

/** @id TEST-VM-004 @verifies REQ-VM-004 */
#[test]
fn test_vm_004_counted_repetition() {
    assert_eq!(span("a{2,3}", "aaaa"), Some((0, 3)));
    assert_eq!(span("a{2,3}?", "aaaa"), Some((0, 2)));
    assert_eq!(span("a{2,3}", "a"), None);
    assert_eq!(span("a{2,}", "aaaaa"), Some((0, 5)));
    assert_eq!(span("a{0}b", "ab"), Some((1, 2)));
    assert_eq!(span("(ab){2}", "ababab"), Some((0, 4)));
}

/** @id TEST-VM-005 @verifies REQ-VM-005 */
#[test]
fn test_vm_005_captures() {
    assert_eq!(caps("(a)(b)?", "a"), Some(vec![Some((0, 1)), Some((0, 1)), None]));
    assert_eq!(caps("(é)(b)?", "éb"), Some(vec![Some((0, 3)), Some((0, 2)), Some((2, 3))]));
    assert_eq!(caps("((a)|(b))c", "bc"), Some(vec![Some((0, 2)), Some((0, 1)), None, Some((0, 1))]));
    assert!(prog("(a)(b)").insts.contains(&Inst::Save(5)));
}

/** @id TEST-VM-006 @verifies REQ-VM-006 */
#[test]
fn test_vm_006_leftmost_search() {
    assert_eq!(span("ab", "xxab"), Some((2, 4)));
    assert_eq!(span("b|ab", "xab"), Some((1, 3)));
    assert_eq!(caps_at("ab", "abab", 1).unwrap()[0], Some((2, 4)));
    assert_eq!(caps_at("ab", "abab", 3), None);
    assert_eq!(span("x*", "aaa"), Some((0, 0)));
    assert_eq!(span("a", "bbb"), None);
}

/** @id TEST-VM-007 @verifies REQ-VM-007 */
#[test]
fn test_vm_007_anchors() {
    assert_eq!(span("^a", "aa"), Some((0, 1)));
    assert_eq!(caps_at("^a", "aa", 1), None);
    assert_eq!(span("a$", "aa"), Some((1, 2)));
    assert_eq!(span("^$", ""), Some((0, 0)));
    assert_eq!(span("a$", "ab"), None);
    assert_eq!(span("(^|b)a", "ba"), Some((0, 2)));
    assert_eq!(span("$", "abc"), Some((3, 3)));
}

/** @id TEST-VM-008 @verifies REQ-VM-008 */
#[test]
fn test_vm_008_empty_loops_terminate() {
    assert_eq!(caps("(a*)*", "b"), Some(vec![Some((0, 0)), None]));
    assert_eq!(caps("(a*)*", "aab"), Some(vec![Some((0, 2)), Some((0, 2))]));
    assert_eq!(span("(|a)+", "aaa"), Some((0, 3)));
    assert_eq!(span("(a?)*b", "aab"), Some((0, 3)));
    assert_eq!(span("(a*)+$", "aa"), Some((0, 2)));
}

/** @id TEST-VM-009 @verifies REQ-VM-009 */
#[test]
fn test_vm_009_last_iteration_capture() {
    assert_eq!(caps("(?:(a)|b)+", "ab"), Some(vec![Some((0, 2)), Some((0, 1))]));
    assert_eq!(caps("(a|b)+", "abab"), Some(vec![Some((0, 4)), Some((3, 4))]));
    assert_eq!(caps("(?:(a)|(b))+", "ab").unwrap()[2], Some((1, 2)));
}

/** @id TEST-VM-010 @verifies REQ-VM-010 */
#[test]
fn test_vm_010_bounded_threads() {
    let p = prog("(a?){25}a{25}");
    let input = "a".repeat(25);
    let (m, peak) = p.find_at_stats(&input, 0);
    assert_eq!(m.unwrap()[1], Some(25));
    assert!(peak <= p.insts.len(), "peak {peak} > {}", p.insts.len());
    let q = prog("(x+x+)+y");
    let (none, peak2) = q.find_at_stats(&"x".repeat(5000), 0);
    assert!(none.is_none());
    assert!(peak2 <= q.insts.len());
}

/** @id TEST-VM-011 @verifies REQ-VM-011 */
#[test]
fn test_vm_011_program_limit() {
    let big = parse("(a{1000}){1000}").unwrap();
    assert_eq!(compile(&big).unwrap_err(), CompileError::TooBig);
    assert!(compile(&parse("a{1000}").unwrap()).is_ok());
}

/** @id TEST-VM-012 @verifies REQ-VM-012 */
#[test]
fn test_vm_012_unicode_offsets() {
    assert_eq!(span(".", "日本"), Some((0, 3)));
    assert_eq!(caps_at(".", "日本", 3).unwrap()[0], Some((3, 6)));
    assert_eq!(caps_at(".", "日本", 1), None);
    assert_eq!(caps_at(".", "日本", 7), None);
    assert_eq!(span("[^a]+", "éa"), Some((0, 2)));
    assert_eq!(span("\\n", "a\nb"), Some((1, 2)));
    assert_eq!(span(".", "\n"), None);
}
