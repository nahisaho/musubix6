use std::io::{Read, Write};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let mut stdin = String::new();
    if refs.iter().any(|a| *a == "-") {
        let _ = std::io::stdin().read_to_string(&mut stdin);
    }
    let out = rx_cli::run(&refs, &stdin);
    let _ = std::io::stdout().write_all(out.stdout.as_bytes());
    let _ = std::io::stderr().write_all(out.stderr.as_bytes());
    std::process::exit(out.code);
}
