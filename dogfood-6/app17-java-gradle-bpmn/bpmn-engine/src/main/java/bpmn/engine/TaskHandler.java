package bpmn.engine;

import bpmn.model.Node;
import java.util.Map;

@FunctionalInterface
public interface TaskHandler {
    void execute(Node task, Map<String, Object> vars) throws Exception;
}
