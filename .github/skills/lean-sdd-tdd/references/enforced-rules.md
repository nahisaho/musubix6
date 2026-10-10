# Rules the script enforces (details)

Spec lock (T2) · REQ line changed since its test's last Green/Refactor ⇒ evidence stale (re-verify: `tdd refactor` for wording-only, `tdd red`/`green` for behaviour changes; so a new requirement means: edit spec first, then test) · Red before Green with identical test hash (per test: its own `@id` region + the preamble before the first `@id`, so editing one test keeps its siblings' evidence) · hash-chained `.sdd/tdd.jsonl` · every REQ has a test, every annotation resolves · skipped checks ⇒ `INCOMPLETE` (exit 2), never PASS.

Every `@verifies` REQ of a test is hash-tracked · `approval: human` needs a lock on any tier; `--by` is normalized (trim/NFKC), so `" ai:x"`, `ai`, empty names cannot pass as a human · frontmatter tolerates CRLF, trailing `# comments`, quotes · `plan` warns about specs missing from `.sdd/plan.md` · a green/refactor run where every test was skipped is rejected · `gate --changed` keeps repo-wide trace errors and sees untracked dirs.

Lock drift: a lock made under T2/`approval: human` goes stale if the spec later drops either (AI approvers are refused; a human re-locks), and a deleted locked spec fails the gate until `approve retire <feature> --by <human>` · BOM/CRLF-normalized spec hashes, full-width (NFKC) `（deferred）`/REQ digits · the last test's hash region ends at its closing line, so appended tests/`main()` don't stale it · `gate --changed` always reports `unknown REQ` trace errors · conflicted ledger ⇒ `tdd merge-ledger` (union, dedupe, re-chain) · `approve prepare` writes `.sdd/prepare-shown.json`; `record` warns without it, and refuses generic human names (bot/user/ai…).

Human-approved specs: `approve record` stores the shas of the `@implements` files; a later change makes `gate` print a `!` warning "implementation changed since approval" (not a failure).

Not enforced (agent discipline): test quality, mutation, security review. Do not claim them.

## Review file schema
If `--review` is a file (e.g. `.sdd/review.md`) it must follow the schema from `$S review template <feature>`: header lines `spec: sha256:<hash>` (first 12 hex chars required), `verdict: pass` (the template starts as `pending` and is rejected until edited), `open: <n>`; findings carry an explicit status (table cell, `- [ ]`, `state: open`, `**Open**`). `open:` must equal the Open lines found and be 0. Validate with `$S review check <file> --feature <f>`.
`approve record --by ai:<reviewer>` requires `--review <path|summary>`; `ai:self` is refused; gate shows lock kind and review evidence.

## Red variants
- Stub Red: if the throwing stub is hit by a setup call rather than an assertion, Red is recorded weak with a warning. `tdd red <ID> --expect <text>` requires the failure output to contain the text (wrong-reason Red is rejected); `--allow-setup-red` accepts it as-is.
- New module tests: `tdd red <ID> --missing-module` accepts a Red caused by the test's own not-yet-created import (not weak).
- Data-only / characterization tests (e.g. a contract lock check) pass without any implementation, so `tdd red` rejects them; record them explicitly with `tdd red <ID> --characterization "<why>"` (stored as a weak Red and counted separately in the gate).
- Legacy repos: `trace --baseline` snapshots errors to `.sdd/trace-baseline.json`; later trace/gate report only new errors (counted per message, so an added same-kind error is new) (`--changed` also limits to changed files).
- Human approval order: `approve prepare <feature>` (shows paths/hashes) → human reviews → `approve record <feature> --by <name>`. Record is refused without a prepare matching the current spec; after any spec/design edit, prepare again. The first implementation after approval refreshes the code baseline; later edits to `@implements` files are flagged.
- `tdd green` accepts a test whose content equals any earlier recorded Red (reverting a wrong test edit); other changes need a new Red. Test-file BOM/CRLF changes do not stale evidence.
- `impact <id|file>`: same-feature REQs are listed apart from other-feature REQs (`!`). Go resolves to files declaring the used symbols (package fallback), JS barrel files over-approximate, Python/Rust/Java/C/PHP resolution is heuristic.
- Weak Red heuristic (setup vs asserted call) is best-effort: helper functions are scanned, and `step(..).unwrap();` right before the assertions counts as the act; `gate` prints a hint to re-run `tdd red <ID> --expect <text>` for weak Reds. Use `--expect` / `--allow-setup-red` to override.
- `@id` suffixes must be uppercase; `CODE-X-001b` is reported as an invalid id, not as a duplicate.
- `gate --changed` warns (`!`) when changed files are imported by code/tests of another feature; their evidence is not re-checked, so run a full gate or `impact <file>`.
  The hint lists every affected feature and also fires on a spec-only change. `impact` resolves Python relative imports, PHP `use`, and skips TS type-only imports; its output is capped.
- Ledger writes take `.sdd/tdd.lock` (stale after 15s), so concurrent `tdd` runs no longer corrupt `tdd.jsonl`. Lone-CR (`\r`) line endings in spec frontmatter are accepted.
- `tdd refactor` warns when the test body changed since the last Green (no Red proves the new assertions); use `tdd red/green` if assertions changed. Record `approve` after the last spec edit: any later edit invalidates the hash.
