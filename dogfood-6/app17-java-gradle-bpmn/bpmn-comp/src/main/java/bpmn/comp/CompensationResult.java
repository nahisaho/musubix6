package bpmn.comp;

import java.util.List;

public record CompensationResult(List<Outcome> outcomes) {
    public boolean allCompensated() { return outcomes.stream().allMatch(o -> o.state() == EntryState.COMPENSATED); }
}
