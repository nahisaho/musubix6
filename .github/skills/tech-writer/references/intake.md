# Intake details (doctype disambiguation and minimum musts)

## Disambiguation questions (fold into the first question)

- `pr-commit`: resolve the subtype — commit message, PR description, bug
  report or feature request. Each has a different skeleton and musts.
- Tech blog: ask Qiita, Zenn, or "no platform, plain document".
- "Technical proposal": internal approval proposal ⇒ `technical-proposal`.
  Supplier response to an RFP ⇒ structure against the RFP's requirement IDs,
  requested proposal contents, pricing format and contract deviations, then
  apply `style-constitution.md`.
- Bare "Blueprint": integrated future state and transformation path
  (`blueprint`), implementation-level detail (`system-design`), or approval
  for one investment (`technical-proposal`).
- Bare "White Paper": evidence-led publication (`white-paper`) or internal
  approval request (`technical-proposal`). A sales brochure is not an
  evidence-led White Paper.

## Stop asking once you have

(a) the reader, (b) the one-sentence reader outcome, (c) the doctype (and
subtype), (d) the doctype-specific musts:

| doctype | must |
|---|---|
| design-doc | decision and alternatives |
| user-manual | prior-knowledge floor |
| release-notes | breaking-change status |
| pr-commit (PR/bug) | related issue |
| requirements-definition | measurable acceptance conditions |
| system-design | approved requirements baseline |
| test-plan | exit criteria |
| operations-runbook | RTO/RPO |
| migration-plan | rollback conditions |
| security-design | assets and trust boundaries |
| rfi | market unknowns |
| rfp | evaluation rules |
| blueprint | planning horizon, approval authority, baseline evidence |
| white-paper | central claim, evidence standard, publisher/sponsor conflicts |

A "don't know" / "not applicable" answer satisfies a must: ask each must at
most once, then record it as a stated assumption or open question in the
document (design docs have an Open Questions section; otherwise a one-line
note).

## Analysis handoff (`consulting-analyst`)

For a Blueprint, White Paper, proposal or decision document without a
defensible analysis, load the sibling `consulting-analyst` skill first and
consume its `synthesis-handoff.md`; never invent the missing analysis in
prose. If the sibling is absent, ask for the decision question and evidence,
or label conclusions as unverified. Preserve issue, hypothesis, source,
evidence, criterion, weight, score, confidence, counterevidence and
uncertainty records. Return to analysis when new evidence, a new decision
question, changed criteria or a contradictory conclusion needs analytical
judgment. Handoff status `Incomplete`: return the decision-critical gaps, or
keep the status, gaps, confidence and conditional wording visible; never
turn it into an unqualified recommendation.
