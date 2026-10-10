namespace ParserKit;

public sealed partial record Failure(int Offset, IReadOnlyList<string> Expected, bool Committed = false, string? Message = null);

public readonly struct ParseResult<T>
{
    public bool Ok { get; init; }
    public T? Value { get; init; }
    public int Next { get; init; }
    public Failure? Error { get; init; }
    public bool Committed { get; init; }
    public Failure? Hint { get; init; }
}

public sealed class Parser<T>
{
    private readonly Func<Source, int, ParseResult<T>> _run;
    public Parser(Func<Source, int, ParseResult<T>> run) => _run = run;
    public ParseResult<T> Parse(Source s, int offset) => _run(s, offset);
    public ParseResult<T> Run(string text) => _run(new Source(text), 0);
}
