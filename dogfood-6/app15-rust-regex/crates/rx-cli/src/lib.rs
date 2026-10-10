use rx_dfa::Dfa;
use rx_engine::{Error, Regex};
use rx_nfa::Nfa;
use rx_syntax::parse;
use rx_vm::compile;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Output {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

const USAGE: &str = "usage: rx <match|full|find-all|captures|replace|split|dfa|prog|equiv> PATTERN [TEXT|-] [ARG]\n";

fn out(code: i32, stdout: String, stderr: String) -> Output {
    Output { code, stdout, stderr }
}

fn fail(msg: &str) -> Output {
    out(2, String::new(), format!("error: {msg}\n"))
}

fn err_text(e: &Error) -> String {
    match e {
        Error::Parse(p) => format!("{:?} at {}", p.kind, p.pos),
        Error::Compile(c) => format!("{c:?}"),
        Error::Unsupported => "unsupported".to_string(),
    }
}

fn text_arg(a: &str, stdin: &str) -> String {
    if a == "-" {
        stdin.strip_suffix('\n').unwrap_or(stdin).to_string()
    } else {
        a.to_string()
    }
}

/** @id CODE-CLI-001 @implements REQ-CLI-001 REQ-CLI-007 REQ-CLI-012 */
pub fn run(args: &[&str], stdin: &str) -> Output {
    let Some(&cmd) = args.first() else {
        return out(2, String::new(), USAGE.to_string());
    };
    if cmd == "--help" || cmd == "-h" {
        return out(0, USAGE.to_string(), String::new());
    }
    const KNOWN: [&str; 9] = ["match", "full", "find-all", "captures", "replace", "split", "dfa", "prog", "equiv"];
    if !KNOWN.contains(&cmd) {
        return fail(&format!("unknown subcommand: {cmd}"));
    }
    let need = match cmd {
        "dfa" | "prog" => 2,
        "replace" => 4,
        _ => 3,
    };
    if args.len() < need {
        return fail("missing argument");
    }
    sub(cmd, args, stdin)
}

/** @id CODE-CLI-002 @implements REQ-CLI-002 REQ-CLI-003 REQ-CLI-004 REQ-CLI-005 REQ-CLI-006 REQ-CLI-011 */
fn sub(cmd: &str, args: &[&str], stdin: &str) -> Output {
    if cmd == "equiv" {
        return equiv(args[1], args[2]);
    }
    let re = match Regex::new(args[1]) {
        Ok(r) => r,
        Err(e) => return fail(&err_text(&e)),
    };
    match cmd {
        "dfa" => return dfa_stats(args[1]),
        "prog" => return prog(args[1]),
        _ => {}
    }
    let text = text_arg(args[2], stdin);
    let ok = |s: String| out(0, s, String::new());
    let miss = || out(1, String::new(), String::new());
    match cmd {
        "match" => match re.find(&text) {
            Some(m) => ok(format!("{}\n", m.as_str())),
            None => miss(),
        },
        "full" => {
            if re.full_match(&text) {
                ok(String::new())
            } else {
                miss()
            }
        }
        "find-all" => {
            let s: String = re
                .find_all(&text)
                .iter()
                .map(|m| format!("{}..{}\t{}\n", m.start(), m.end(), m.as_str()))
                .collect();
            ok(s)
        }
        "captures" => match re.captures(&text) {
            None => miss(),
            Some(c) => {
                let mut s = String::new();
                for i in 0..c.len() {
                    match c.get(i) {
                        Some(m) => s.push_str(&format!("{i}: {:?}\n", m.as_str())),
                        None => s.push_str(&format!("{i}: none\n")),
                    }
                }
                ok(s)
            }
        },
        "replace" => ok(format!("{}\n", re.replace_all(&text, args[3]))),
        _ => ok(re.split(&text).iter().map(|p| format!("{p}\n")).collect()),
    }
}

fn automaton(pattern: &str) -> Result<Dfa, String> {
    let parsed = parse(pattern).map_err(|e| err_text(&Error::Parse(e)))?;
    let nfa = Nfa::from_parsed(&parsed).map_err(|e| format!("{e:?}"))?;
    let dfa = Dfa::from_nfa(&nfa).map_err(|e| match e {
        rx_dfa::DfaError::Unsupported => "unsupported".to_string(),
        other => format!("{other:?}"),
    })?;
    Ok(dfa.minimize())
}

/** @id CODE-CLI-003 @implements REQ-CLI-008 */
fn dfa_stats(pattern: &str) -> Output {
    match automaton(pattern) {
        Ok(d) => out(
            0,
            format!("states: {}\nclasses: {}\nlive: {}\n", d.num_states(), d.num_classes(), d.live_states().len()),
            String::new(),
        ),
        Err(e) => fail(&e),
    }
}

/** @id CODE-CLI-004 @implements REQ-CLI-009 */
fn prog(pattern: &str) -> Output {
    let parsed = match parse(pattern) {
        Ok(p) => p,
        Err(e) => return fail(&err_text(&Error::Parse(e))),
    };
    match compile(&parsed) {
        Ok(p) => out(0, p.disassemble(), String::new()),
        Err(e) => fail(&format!("{e:?}")),
    }
}

/** @id CODE-CLI-005 @implements REQ-CLI-010 */
fn equiv(a: &str, b: &str) -> Output {
    match (automaton(a), automaton(b)) {
        (Ok(x), Ok(y)) => {
            if x.equivalent(&y) {
                out(0, "equivalent\n".into(), String::new())
            } else {
                out(1, "different\n".into(), String::new())
            }
        }
        (Err(e), _) | (_, Err(e)) => fail(&e),
    }
}
