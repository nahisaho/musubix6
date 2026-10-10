package bpmn.model;

public record Flow(String from, String to, String condition, boolean isDefault) {}
