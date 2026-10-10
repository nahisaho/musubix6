package bpmn.model;

public class ParseException extends RuntimeException {
    private final int line;
    public ParseException(int line, String message) { super("line " + line + ": " + message); this.line = line; }
    public int line() { return line; }
}
