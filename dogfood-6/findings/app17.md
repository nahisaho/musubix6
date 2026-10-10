# app17 findings (java-gradle-bpmn)

## 1. Gradle/Maven test filter `*{idu}*` prefix-collides (TEST-X-1 vs TEST-X-10)
Repro: dogfood-6/repro-app17-a (Gradle; tests test_x_1_one passes, test_x_10_ten fails).
`$S --root . tdd green TEST-X-1`
Actual: "GREEN REJECTED TEST-X-1: test failed / 2 tests completed, 1 failed" (the filter also ran test_x_10_*).
Expected: only TEST-X-1 is run; Green accepted. Likewise Red for TEST-X-1 may be falsely satisfied by TEST-X-10 failing.
Location: sdd.mjs:417 (gradle `--tests "*$0*"`), :416 (maven `*#*{idu}*`); same substring style elsewhere.
Workaround: zero-pad IDs to a fixed width (TEST-X-001) or avoid ids that are prefixes of others.

## 2. `review template` without <feature> prints placeholder template, exit 0
Repro: `$S --root <app> review template; echo $?`
Actual: template with `spec: sha256:<spec sha256>`, exit 0. Expected: usage error exit 2 (as `review check` does).
Location: sdd.mjs ~706-718.
Workaround: always pass the feature.

## 3. `tdd stub` for Java yields uncompilable stubs for chained calls
Repro: test using `m.node("a").type()`, `m.flows().get(0)`, `m.nodes().stream()`; `$S --root <app> tdd stub TEST-MODEL-001`.
Actual: method return types inferred as NodeType / NodesResult / FlowsResult / StreamResult / MapResult; `.get(0)`/`.stream()` don't compile; Node, Flow, Issue, ParseException not stubbed; `tdd red` then reports compile error in another test's body.
Expected: compilable stubs (e.g. Object/generic or stub the domain types).
Location: sdd.mjs ~1141 (chainClasses `<Name>Result`).
Workaround: hand-written throwing stubs.
