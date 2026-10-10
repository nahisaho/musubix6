# Rubber-duck review loop (write mode only)

Run after the structural review (SKILL.md §4) and any Japanese prose
optimization (§5). Mandatory for `write`; never for `review` or `score`.

Use the host's subagent mechanism to launch an independent reviewer in the
`rubber-duck` role (prefer a registered `rubber-duck` agent; otherwise an
independent general-purpose/critic subagent with the same prompt). Treat the
reviewer as unavailable only when the host has no independent subagent
mechanism. The author's own self-review never substitutes.

1. **Full context**: give the reviewer the target file, doctype, intended
   reader, the one-sentence reader outcome, and explicit constraints or
   assumptions. Ask for concrete, actionable problems in correctness, logic,
   missing information, reader flow, examples and stated limitations — not
   cosmetic preferences.
2. **Resolve every valid finding by editing the document.** A finding that
   conflicts with a stated requirement or is factually inapplicable is
   declined with a one-line reason.
3. **Re-run checks after each edit round**: repeat the §5 optimization over
   changed Japanese prose, then the doctype checklist and structural lint
   (§4) before the next review. A fix must not add a structural defect or
   leave final Japanese prose outside the optimization pass. If a required
   rerun cannot start (all 15 handoffs used) or cannot complete, report
   `Japanese prose optimization did not converge`, not `completed`.
4. **Review again with prior decisions**: reuse the reviewer context when
   supported; otherwise include previous findings, applied fixes and
   declined findings with reasons in every new prompt, and ask for
   unresolved or newly introduced actionable findings.
5. **Bounded convergence**: at most five rounds for a living, multi-section
   document. For an atomic artifact run one round and stop if clean;
   continue only after an actionable finding, maximum three rounds. A round
   is clean when no unaddressed actionable correctness, logic,
   completeness, reader-flow, example or limitation finding remains; a
   finding declined with a recorded requirement-based or factual reason is a
   resolved exception (resupply it under step 4). Cosmetic preferences are
   not actionable.
6. **Report non-clean outcomes precisely**: no independent reviewer ⇒
   `review not performed` (never claim the pass completed). Round limit
   reached with unaddressed actionable findings, or findings oscillating
   between contradictory requirements ⇒ `review did not converge`, listing
   the latest unresolved findings and fixes attempted.
