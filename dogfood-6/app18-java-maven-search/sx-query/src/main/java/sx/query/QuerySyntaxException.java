package sx.query;

public class QuerySyntaxException extends RuntimeException {
    private final int offset;

    public QuerySyntaxException(String message, int offset) {
        super(message + " at offset " + offset);
        this.offset = offset;
    }

    public int offset() {
        return offset;
    }
}
