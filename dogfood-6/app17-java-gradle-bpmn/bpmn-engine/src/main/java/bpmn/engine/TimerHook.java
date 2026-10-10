package bpmn.engine;

import bpmn.model.Node;

@FunctionalInterface
public interface TimerHook {
    void arm(Instance instance, Token token, Node timerNode);
}
