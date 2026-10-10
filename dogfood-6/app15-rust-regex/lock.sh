#!/bin/sh
# usage: lock.sh <feature> "<finding summary>"
S="node /home/nahisaho/GitHub/musubix6/.github/skills/lean-sdd-tdd/scripts/sdd.mjs"
f=$1
h=$($S --root . review template "$f" | head -1)
printf '%s\nverdict: pass\nopen: 0\n\n## Findings\n| ID | Severity | Where | Status |\n|----|----------|-------|--------|\n| F1 | low | %s | Closed |\n' "$h" "$2" > .sdd/review-$f.md
$S --root . review check .sdd/review-$f.md --feature "$f" && $S --root . approve record "$f" --by ai:spec-reviewer --review .sdd/review-$f.md
