"""Four-valued policy combination, with explicit precedence."""
PRECEDENCE = {
    "deny-overrides": ("Deny", "Indeterminate", "Permit", "NotApplicable"),
    "permit-overrides": ("Permit", "Indeterminate", "Deny", "NotApplicable"),
}
ALGORITHMS = (*PRECEDENCE, "first-applicable", "only-one-applicable")
DECISIONS = frozenset(PRECEDENCE["deny-overrides"])

# @id CODE-COMBINE-001 @implements REQ-COMBINE-001 REQ-COMBINE-002 REQ-COMBINE-003 REQ-COMBINE-004 REQ-COMBINE-005 REQ-COMBINE-006 REQ-COMBINE-007 REQ-COMBINE-008
def combine(results, algorithm="deny-overrides"):
    if algorithm not in ALGORITHMS:
        raise ValueError("unknown algorithm")
    results = tuple(results)
    if any(result not in DECISIONS for result in results):
        raise ValueError("invalid decision")
    if algorithm in PRECEDENCE:
        return next((value for value in PRECEDENCE[algorithm] if value in results), "NotApplicable")
    applicable = [value for value in results if value != "NotApplicable"]
    if algorithm == "only-one-applicable" and len(applicable) > 1:
        return "Indeterminate"
    return applicable[0] if applicable else "NotApplicable"
