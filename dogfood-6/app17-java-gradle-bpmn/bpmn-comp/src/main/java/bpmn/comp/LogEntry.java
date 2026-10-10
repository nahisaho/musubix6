package bpmn.comp;

public record LogEntry(String taskId, String tokenId, int seq, EntryState state, String detail) {}
