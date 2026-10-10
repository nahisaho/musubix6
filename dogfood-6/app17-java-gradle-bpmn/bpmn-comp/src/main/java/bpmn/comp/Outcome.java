package bpmn.comp;

public record Outcome(String taskId, String tokenId, int seq, EntryState state, String detail) {}
