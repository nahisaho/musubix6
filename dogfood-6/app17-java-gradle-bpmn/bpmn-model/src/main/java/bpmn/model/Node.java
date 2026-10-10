package bpmn.model;

import java.util.Map;

public record Node(String id, NodeType type, Map<String, String> attrs) {}
