use rx_cli::run;
use std::io::Write;
use std::process::{Command, Stdio};

fn rx(args: &[&str]) -> (i32, String, String) {
    let o = run(args, "");
    (o.code, o.stdout, o.stderr)
}

/** @id TEST-CLI-001 @verifies REQ-CLI-001 */
#[test]
fn test_cli_001_usage() {
    let (c, out, err) = rx(&[]);
    assert_eq!((c, out.as_str()), (2, ""));
    assert!(err.starts_with("usage: rx"));
    let (c, out, _) = rx(&["--help"]);
    assert_eq!(c, 0);
    assert!(out.starts_with("usage: rx"));
    let (c, _, err) = rx(&["frobnicate"]);
    assert_eq!(c, 2);
    assert!(err.contains("unknown subcommand: frobnicate"));
}

/** @id TEST-CLI-002 @verifies REQ-CLI-002 */
#[test]
fn test_cli_002_match() {
    assert_eq!(rx(&["match", "b+", "aabbc"]), (0, "bb\n".into(), "".into()));
    assert_eq!(rx(&["match", "z", "aabbc"]), (1, "".into(), "".into()));
}

/** @id TEST-CLI-003 @verifies REQ-CLI-003 */
#[test]
fn test_cli_003_full() {
    assert_eq!(rx(&["full", "a|ab", "ab"]).0, 0);
    assert_eq!(rx(&["full", "a|ab", "abc"]).0, 1);
}

/** @id TEST-CLI-004 @verifies REQ-CLI-004 */
#[test]
fn test_cli_004_find_all() {
    assert_eq!(rx(&["find-all", "a+", "baaca"]).1, "1..3\taa\n4..5\ta\n");
    assert_eq!(rx(&["find-all", "", "é"]).1, "0..0\t\n2..2\t\n");
    assert_eq!(rx(&["find-all", "x*", "日a"]).1, "0..0\t\n3..3\t\n4..4\t\n");
}

/** @id TEST-CLI-005 @verifies REQ-CLI-005 */
#[test]
fn test_cli_005_captures() {
    assert_eq!(rx(&["captures", "(a)(b)?c", "xac"]), (0, "0: \"ac\"\n1: \"a\"\n2: none\n".into(), "".into()));
    assert_eq!(rx(&["captures", "(a)", "b"]).0, 1);
}

/** @id TEST-CLI-006 @verifies REQ-CLI-006 */
#[test]
fn test_cli_006_replace() {
    assert_eq!(rx(&["replace", "(\\w+)@(\\w+)", "joe@site", "$2:$1"]).1, "site:joe\n");
    assert_eq!(rx(&["replace", "é", "éaé", "e"]).1, "eae\n");
}

/** @id TEST-CLI-007 @verifies REQ-CLI-007 */
#[test]
fn test_cli_007_bad_pattern() {
    assert_eq!(rx(&["match", "a(", "x"]), (2, "".into(), "error: UnclosedGroup at 1\n".into()));
    assert_eq!(rx(&["full", "*", "x"]).2, "error: NothingToRepeat at 0\n");
}

/** @id TEST-CLI-008 @verifies REQ-CLI-008 */
#[test]
fn test_cli_008_dfa_stats() {
    assert_eq!(rx(&["dfa", "(a|b)*abb"]).1, "states: 5\nclasses: 4\nlive: 4\n");
    assert_eq!(rx(&["dfa", "^a"]), (2, "".into(), "error: unsupported\n".into()));
}

/** @id TEST-CLI-009 @verifies REQ-CLI-009 */
#[test]
fn test_cli_009_prog() {
    assert_eq!(rx(&["prog", "a|b"]).1, "0000 split 1, 3\n0001 char 'a'\n0002 jmp 4\n0003 char 'b'\n0004 match\n");
}

/** @id TEST-CLI-010 @verifies REQ-CLI-010 */
#[test]
fn test_cli_010_equiv() {
    assert_eq!(rx(&["equiv", "(a|b)*", "(a*b*)*"]), (0, "equivalent\n".into(), "".into()));
    assert_eq!(rx(&["equiv", "a+", "a*"]), (1, "different\n".into(), "".into()));
    assert_eq!(rx(&["equiv", "^a", "a"]).0, 2);
}

/** @id TEST-CLI-011 @verifies REQ-CLI-011 */
#[test]
fn test_cli_011_stdin_text() {
    let o = run(&["match", "b+", "-"], "aabbc");
    assert_eq!((o.code, o.stdout.as_str()), (0, "bb\n"));
    let o = run(&["match", "b+", "-"], "aabbc\n");
    assert_eq!(o.stdout, "bb\n");
}

/** @id TEST-CLI-012 @verifies REQ-CLI-012 */
#[test]
fn test_cli_012_split_missing_arg_and_binary() {
    assert_eq!(rx(&["split", ",", "a,b,,c"]).1, "a\nb\n\nc\n");
    assert_eq!(rx(&["match", "a"]), (2, "".into(), "error: missing argument\n".into()));
    let mut child = Command::new(env!("CARGO_BIN_EXE_rx"))
        .args(["match", "b+", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .unwrap();
    child.stdin.take().unwrap().write_all(b"abbb").unwrap();
    let out = child.wait_with_output().unwrap();
    assert_eq!(out.status.code(), Some(0));
    assert_eq!(String::from_utf8(out.stdout).unwrap(), "bbb\n");
    let bad = Command::new(env!("CARGO_BIN_EXE_rx")).args(["match", "a(", "x"]).output().unwrap();
    assert_eq!(bad.status.code(), Some(2));
}
