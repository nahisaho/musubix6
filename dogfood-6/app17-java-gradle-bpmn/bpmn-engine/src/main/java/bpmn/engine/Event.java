package bpmn.engine;

public record Event(int seq, String type, String nodeId, String tokenId, String detail) {}
