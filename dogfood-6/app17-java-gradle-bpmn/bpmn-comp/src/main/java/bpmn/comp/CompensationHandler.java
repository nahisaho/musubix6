package bpmn.comp;

import bpmn.model.Node;
import java.util.Map;

@FunctionalInterface
public interface CompensationHandler {
    void compensate(Node task, Map<String, Object> vars) throws Exception;
}
