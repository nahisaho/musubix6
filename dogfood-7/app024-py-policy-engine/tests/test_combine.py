import itertools
import pytest
from policy.combine import combine

# @id TEST-COMBINE-001 @verifies REQ-COMBINE-001
def test_combine_001():
    order = ["Deny", "Indeterminate", "Permit", "NotApplicable"]
    for pair in itertools.product(order, repeat=2):
        assert combine(pair, "deny-overrides") == min(pair, key=order.index)

# @id TEST-COMBINE-002 @verifies REQ-COMBINE-002
def test_combine_002():
    order = ["Permit", "Indeterminate", "Deny", "NotApplicable"]
    for pair in itertools.product(order, repeat=2):
        assert combine(pair, "permit-overrides") == min(pair, key=order.index)

# @id TEST-COMBINE-003 @verifies REQ-COMBINE-003
def test_combine_003():
    for pair in itertools.product(["Permit", "Deny", "Indeterminate", "NotApplicable"], repeat=2):
        assert combine(pair, "first-applicable") == next((x for x in pair if x != "NotApplicable"), "NotApplicable")

# @id TEST-COMBINE-004 @verifies REQ-COMBINE-004
def test_combine_004():
    for pair in itertools.product(["Permit", "Deny", "Indeterminate"], repeat=2):
        assert combine(pair, "only-one-applicable") == "Indeterminate"

# @id TEST-COMBINE-005 @verifies REQ-COMBINE-005
def test_combine_005():
    for value in ["Permit", "Deny", "Indeterminate"]:
        assert combine(["NotApplicable", value], "only-one-applicable") == value

# @id TEST-COMBINE-006 @verifies REQ-COMBINE-006
def test_combine_006():
    for alg in ["deny-overrides", "permit-overrides", "first-applicable", "only-one-applicable"]:
        assert combine([], alg) == "NotApplicable"

# @id TEST-COMBINE-007 @verifies REQ-COMBINE-007
def test_combine_007():
    with pytest.raises(ValueError, match="algorithm"):
        combine(["Permit"], "random")

# @id TEST-COMBINE-008 @verifies REQ-COMBINE-008
def test_combine_008():
    with pytest.raises(ValueError, match="decision"):
        combine(["Allow"], "deny-overrides")
