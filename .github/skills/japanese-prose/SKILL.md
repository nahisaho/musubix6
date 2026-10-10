---
name: japanese-prose
description: >-
  Improves Japanese prose in technical and business documents using
  kotonoha's original GiNZA-based diagnostics. Use when writing, rewriting,
  reviewing, or scoring Japanese prose; when the user asks for more natural,
  readable, concise, or less AI-like Japanese; or when tech-writer delegates
  its sentence-level quality pass. Owns wording, sentence rhythm, reading
  load, terminology review, and formulaic-expression detection. Does not own
  technical-document structure or presentation storylines.
license: MIT
argument-hint: "[write|review|score] [quick|full] <target file or request>"
---

# japanese-prose

Improves Japanese wording without changing approved facts, obligations,
identifiers, evidence, code, or document structure. This is an original
kotonoha implementation. It uses
[GiNZA](https://github.com/megagonlabs/ginza) for tokenization, part-of-speech
tagging, dependency parsing, lemmatization, and named-entity recognition.

## Responsibility boundary

- `tech-writer` owns doctype selection, section structure, completeness,
  traceability, and Markdown organization.
- `presentation-planner` owns audience strategy, scenarios, slide order, and
  design specifications.
- `japanese-prose` owns sentence-level Japanese: clarity, rhythm, reading
  load, terminology, repeated patterns, and contextual rewriting.

Never move, add, or remove sections unless the calling skill explicitly
authorizes it. Never alter requirement IDs, risk IDs, control IDs, numbers,
units, dates, proper nouns, citations, URLs, commands, tables, schemas,
acceptance criteria, approval states, or normative force.

## Modes

- `write`: write or rewrite Japanese prose. Use `quick` unless the document
  is external-facing, high-risk, or longer than roughly 10,000 Japanese
  characters.
- `review`: report problems and proposed corrections without editing.
- `score`: run diagnostics and report the 0–100 score without rewriting.
- `quick`: run prose lint once, review findings in context, edit, and rerun
  until no new actionable findings appear.
- `full`: run prose lint, reading-load lint, outline extraction, and
  terminology extraction; then review the whole document against
  `references/review-workflow.md`.

## Workflow

1. Read the target, audience, intended outcome, and calling skill's frozen
   invariants.
2. Read `references/writing-guidelines.md` before generating or rewriting
   prose.
3. Run the GiNZA prose diagnostic:

   ```bash
   uv run scripts/lint.py <target-file> --genre tech --json > <workdir>/prose-baseline.json
   ```

4. For `full` mode, also run:

   ```bash
   uv run scripts/lint.py <target-file> --genre tech --reading-load --json
   uv run scripts/outline.py <target-file>
   uv run scripts/terms.py <target-file> --json
   ```

5. Classify each finding as `fix` or `keep`. A detector identifies a review
   target; it does not authorize blind replacement.
6. Apply only fixes that improve the intended reader's understanding while
   preserving the frozen invariants.
7. Rerun the prose diagnostic with
   `--baseline <workdir>/prose-baseline.json` to classify new, persisting,
   and resolved findings. Replace the baseline only after recording the
   decisions for the current round.
8. Stop when every finding has a decision, no new actionable finding appears,
   and the document passes the checks in `references/review-workflow.md`.

Allow at most three edit-and-diagnose rounds per invocation. If actionable
findings or invariant violations remain, report that the optimization did not
converge and list the unresolved items.

## Markdown emphasis

When strong emphasis touches surrounding prose, put half-width spaces outside
the delimiters: `これは **重要** です`, not `これは**重要**です`. Spaces are
unnecessary at line boundaries or next to punctuation, and must not be placed
inside `**`. Use ASCII spaces (`U+0020`), never full-width spaces (`U+3000`),
tabs, or non-breaking spaces, immediately before and after emphasis embedded
in prose. Write `これは **「重要」** と説明する`, not
`これは　**「重要」**　と説明する`.

## Diagnostic interpretation

The score is a triage aid, not a quality certificate. Read
`references/scoring.md` before presenting it. GiNZA provides linguistic
observations; the agent remains responsible for deciding whether a change is
correct in context.

## Completion report

Report:

- mode and diagnostics executed
- initial and final scores
- findings fixed and findings deliberately kept
- any skipped diagnostic and its reason
- invariant verification result
- `completed` or `did not converge`
