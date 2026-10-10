package bpmn.engine;

public class ExprException extends RuntimeException {
    private final String code;
    private final int pos;
    public ExprException(String code, int pos, String message) { super(code + " at " + pos + ": " + message); this.code = code; this.pos = pos; }
    public String code() { return code; }
    public int pos() { return pos; }
}
