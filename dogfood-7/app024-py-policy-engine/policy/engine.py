"""Policy compiler and auditable request evaluator."""
from .dsl import parse, evaluate
from .roles import closure
from .combine import combine

# @id CODE-DECISIONS-001 @implements REQ-DECISIONS-007
def compile_rules(rules):
    ids, compiled = set(), []
    for rule in rules:
        if not isinstance(rule, dict):
            raise ValueError("invalid rule")
        identity = rule.get("id")
        if not isinstance(identity, str) or not identity or identity in ids:
            raise ValueError("invalid or duplicate rule ID")
        if rule.get("effect") not in ("Permit", "Deny"):
            raise ValueError("invalid rule effect")
        if not isinstance(rule.get("roles", []), list) or any(not isinstance(r, str) for r in rule.get("roles", [])):
            raise ValueError("invalid required roles")
        if not isinstance(rule.get("obligations", []), list) or any(not isinstance(o, str) for o in rule.get("obligations", [])):
            raise ValueError("invalid obligations")
        ids.add(identity)
        compiled.append((rule, parse(rule.get("when", "True"))))
    return compiled

def collect_obligations(compiled, outcomes, decision):
    if decision not in ("Permit", "Deny"):
        return []
    return list(dict.fromkeys(
        obligation
        for (rule, _), outcome in zip(compiled, outcomes) if outcome == decision
        for obligation in rule.get("obligations", [])
    ))

# @id CODE-DECISIONS-002 @implements REQ-DECISIONS-001 REQ-DECISIONS-002 REQ-DECISIONS-003 REQ-DECISIONS-004 REQ-DECISIONS-005 REQ-DECISIONS-006 REQ-DECISIONS-008 REQ-DECISIONS-009
def decide(rules, request, algorithm="deny-overrides", hierarchy=None):
    compiled = compile_rules(rules)
    outcomes, trace = [], []
    for rule, tree in compiled:
        try:
            if not evaluate(tree, request):
                outcome, reason = "NotApplicable", "condition false"
            elif rule.get("roles"):
                if not isinstance(request, dict) or not isinstance(request.get("subject", {}), dict):
                    raise ValueError("invalid subject")
                assigned = request.get("subject", {}).get("roles", [])
                resolved = closure(hierarchy or {}, assigned)
                if not set(resolved).intersection(rule["roles"]):
                    outcome, reason = "NotApplicable", "role mismatch"
                else:
                    outcome, reason = rule["effect"], "condition matched"
            else:
                outcome, reason = rule["effect"], "condition matched"
        except ValueError:
            outcome, reason = "Indeterminate", "evaluation failed"
        outcomes.append(outcome)
        trace.append({"id": rule["id"], "outcome": outcome, "reason": reason})
    decision = combine(outcomes, algorithm)
    obligations = collect_obligations(compiled, outcomes, decision)
    return {"decision": decision, "authorized": decision == "Permit", "trace": trace, "obligations": obligations}
