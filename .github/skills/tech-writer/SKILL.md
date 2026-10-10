---
name: tech-writer
description: >-
  Structures and polishes technical documents: README, design docs/ADRs, API
  docs, PR/commit/issue text, release notes, user manuals, code comments,
  requirements, system designs, test plans, runbooks, migration plans,
  security designs/threat models, technical proposals, Blueprints, White
  Papers, RFI/RFP, Qiita/Zenn articles. Use for "write a README", "draft a
  design doc", "write this PR description", "create a test plan" etc., and
  Japanese equivalents (「READMEを書いて」「設計ドキュメントを作って」
  「要件定義書を作って」「テスト計画書を作って」「PRの説明文を書いて」
  「Zennの記事を書いて」). Also for bare goals ("○○を書きたい"): it runs a
  one-question-at-a-time intake before writing. Japanese primary, English
  supported. Owns structure, completeness and reader fit; hands Japanese
  prose to the bundled `japanese-prose` skill.
license: MIT
argument-hint: "[write|review|score] [doctype] <target file or request>"
---

# tech-writer

Structures technical documents so readers reach what they need by the
shortest path. Default format is Markdown, except a git commit body (plain
text; light "-" bullets only), code comments/docstrings (the language's own
syntax), and Zenn/Qiita (Markdown + platform frontmatter; see their
doctype files).

## Division of labor

- `consulting-analyst` (sibling): problem decomposition, evidence, option
  evaluation. Details: `references/intake.md`.
- this skill: structure, doctype conventions, completeness, reader fit
  ("does removing a heading still make sense?").
- `japanese-prose` (sibling): sentence naturalness, reading load,
  terminology ("does rereading one sentence change its meaning?").

## Modes

- `write` (default; "write/create"): full §1–§6, ending only after the
  rubber-duck loop has no actionable findings, or returning the explicit
  status from `references/review-loop.md`. In-scope Japanese documents also
  return a §5 status.
- `review` ("fix/review"): structural review against the doctype checklist;
  no rewrite.
- `score` ("how does this look?"): run `scripts/lint.py --json <file>` and
  summarize; no rewrite.

## 1. Intake — one question at a time, then act

Do not front-load a questionnaire or show a checklist.

1. Determine the doctype first (table below); ambiguity is the first
   question. Subtype/platform/analysis disambiguation and the per-doctype
   musts: `references/intake.md`.
2. Open the doctype reference; note target reader and "settle before
   writing" items.
3. Ask exactly one question per message: the most information-gaining
   missing item. Skip what the user already gave.
4. Stop at: reader, one-sentence reader outcome, doctype, doctype musts. A
   non-answer satisfies a must (ask once, record as assumption/open
   question).
5. Then synthesize and continue into §2–§6 in the same turn; ask for
   confirmation only for release-facing consequential docs (e.g. public
   release notes with breaking changes) or if the user wants a plan first.

| Request | doctype (`references/doctypes/<doctype>.md`) |
|---|---|
| README / project overview | readme |
| Design doc / ADR / RFC | design-doc |
| API reference | api-docs |
| PR description / commit message / issue report | pr-commit |
| Release notes / CHANGELOG | release-notes |
| User manual / how-to / tutorial | user-manual |
| Code comments / docstrings | code-comments |
| Requirements definition / 要件定義書 | requirements-definition |
| System design / システム設計書 | system-design |
| Test plan / テスト計画書 | test-plan |
| Operations design / Runbook / 運用設計書 | operations-runbook |
| Migration plan / 移行計画書 | migration-plan |
| Security design / Threat model | security-design |
| Internal technical proposal | technical-proposal |
| Blueprint / 将来構想 | blueprint |
| White Paper | white-paper |
| RFI / RFP | rfi / rfp |
| Zenn / Qiita article | zenn / qiita |

No match: apply `references/style-constitution.md` with the same intake.

## 2. Outline first for long documents

For long or multi-step documents (design docs, manuals, API references,
requirements, designs, plans, runbooks, proposals, Blueprints, White
Papers, RFI/RFP, anything "detailed"/"comprehensive", and a whole
CHANGELOG): draft the heading outline from the reader/outcome and the
doctype skeleton, then read only the headings as the §1 reader — can they
predict each section, does the order match how they look things up, does it
reach the outcome? Reorder/merge/split before writing prose. Skip for
atomic artifacts (single commit message, short PR description, one
appended release-notes entry, a code comment).

## 3. Write — under the structure constitution

Living, multi-section documents follow the 8 rules in
`references/style-constitution.md`: purpose and reader outcome in the first
three lines; headings that preview content; steps in execution order with
prerequisites first; one action per numbered step; a concrete example right
after any abstract term; minimal runnable code with explicit omissions;
disclosed limitations; last-updated date/target version where staleness
matters. For Zenn/Qiita, "first three lines" = frontmatter `title` + lead
paragraph (Zenn sections start at `##`; Qiita at `#`, subsections `##`).
Atomic artifacts use their own skeleton (`pr-commit.md`, `code-comments.md`,
`release-notes.md`).

Markdown emphasis: put ASCII half-width spaces (`U+0020`) outside `**...**`
where delimiters would touch prose (`これは **強調** になる`); not required
at line boundaries or next to punctuation; never inside the delimiters; never
full-width/tab/NBSP.

## 4. Review — structural check

1. Skeleton read-through: headings + first sentence of each section, as the
   §1 reader; the argument holds and nothing assumes unknown knowledge.
2. Doctype checklist at the end of the doctype reference.
3. Lint: `uv run scripts/lint.py <file>` (`--atomic` for atomic artifacts):
   heading skips, untagged code blocks, placeholders, suspicious links,
   emphasis spacing. Findings are flags; keep deliberate exceptions with a
   brief reason.
4. Reader-goal recheck: the §1 outcome is achievable from the document
   alone.

For atomic artifacts, steps 1 and 4 collapse into re-reading against the
doctype skeleton; step 2 is primary.

## 5. Japanese prose optimization — write mode only

For a living, multi-section document whose final language is Japanese, hand
the completed draft to `japanese-prose` (mandatory; procedure, frozen
invariants and loop: `references/japanese-prose-optimization.md`). Resolve
`<tech-writer-dir>/../japanese-prose/SKILL.md`, then
`.github/skills/`, `.copilot/skills/`, `$HOME/.copilot/skills/`. Afterwards
repeat §4. Report one status:

- `Japanese prose optimization completed`
- `Japanese prose optimization not performed` (no compatible optimizer;
  state why)
- `Japanese prose optimization did not converge` (optimizer failed or
  broke an invariant after reverting and retrying; at most 15 handoffs in
  the whole write workflow)

No status for atomic artifacts (unless the user asks for polishing of a
standalone prose file) or non-Japanese documents. Never claim it from
structural lint alone.

## 6. Rubber-duck review loop — write mode only

After §4 and §5, run the independent reviewer loop in
`references/review-loop.md` (≤5 rounds for living documents, ≤3 for atomic
ones). Report `review not performed` or `review did not converge` precisely
when applicable.

## 7. Common checklist

(Atomic artifacts use their own doctype checklist.) First three lines state
purpose and reader; headings alone trace the flow; prerequisites precede
steps; examples copy-paste and run; limitations are stated; version/date
where staleness is a risk.

## Acknowledgment

The bundled prose optimizer is an original kotonoha implementation built on
[GiNZA](https://github.com/megagonlabs/ginza) (MIT License).
