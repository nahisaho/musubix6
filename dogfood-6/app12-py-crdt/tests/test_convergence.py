import pytest
from crdt.harness import KINDS, check_laws, replay_unchanged, run_convergence, run_partition

ALL = ["gcounter", "pncounter", "lwwmap", "orset"]


# @id TEST-CONVERGENCE-001
# @verifies REQ-CONVERGENCE-001
@pytest.mark.parametrize("kind", ALL)
def test_convergence_001(kind):
    assert list(KINDS) == ALL
    for seed in range(5):
        assert check_laws(kind, seed) == []


# @id TEST-CONVERGENCE-002
# @verifies REQ-CONVERGENCE-002
@pytest.mark.parametrize("kind", ALL)
def test_convergence_002(kind):
    left_biased = lambda a, b: a
    problems = check_laws(kind, 1, merge=left_biased)
    assert problems
    assert any("commutative" in p for p in problems)


# @id TEST-CONVERGENCE-003
# @verifies REQ-CONVERGENCE-003
@pytest.mark.parametrize("kind", ALL)
def test_convergence_003(kind):
    for seed in range(20):
        rep = run_convergence(kind, seed)
        assert rep.converged, (kind, seed, rep)
        assert rep.rounds >= 0


# @id TEST-CONVERGENCE-004
# @verifies REQ-CONVERGENCE-004
@pytest.mark.parametrize("kind", ALL)
def test_convergence_004(kind):
    assert run_convergence(kind, 7) == run_convergence(kind, 7)
    assert run_convergence(kind, 7).digest != run_convergence(kind, 8).digest


# @id TEST-CONVERGENCE-005
# @verifies REQ-CONVERGENCE-005
@pytest.mark.parametrize("kind", ALL)
def test_convergence_005(kind):
    for seed in range(5):
        rep = run_partition(kind, seed)
        assert rep.diverged_during_partition
        assert rep.converged_after_heal


# @id TEST-CONVERGENCE-006
# @verifies REQ-CONVERGENCE-006
@pytest.mark.parametrize("kind", ALL)
def test_convergence_006(kind):
    before, after, replays = replay_unchanged(kind, 3)
    assert replays > 0
    assert before == after


# @id TEST-CONVERGENCE-007
# @verifies REQ-CONVERGENCE-007
@pytest.mark.parametrize("kind", ["gcounter", "pncounter"])
def test_convergence_007(kind):
    for seed in range(20):
        rep = run_convergence(kind, seed)
        assert rep.value == rep.expected
