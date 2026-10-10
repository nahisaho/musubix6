namespace ParserKit.Lang;

public sealed record Diagnostic(Pos Pos, string Message);
public sealed record ErrorStmt(Span Span) : Expr(Span);
public sealed record ProgramResult(IReadOnlyList<Expr> Statements, IReadOnlyList<Diagnostic> Diagnostics);

public static class Recovery
{
    /** @id CODE-REC-001 @implements REQ-REC-003 */
    internal static List<(int Start, int End)> Slices(string text)
    {
        var res = new List<(int, int)>();
        int start = 0, depth = 0;
        bool inStr = false, inCom = false;
        for (int i = 0; i < text.Length; i++)
        {
            char c = text[i];
            if (inStr)
            {
                if (c == '\\') i++;
                else if (c == '"') inStr = false;
            }
            else if (inCom) { if (c == '\n') inCom = false; }
            else if (c == '"') inStr = true;
            else if (c == '#') inCom = true;
            else if (c == '(') depth++;
            else if (c == ')') { if (depth > 0) depth--; }
            else if (c == ';' && depth == 0) { res.Add((start, i)); start = i + 1; }
        }
        res.Add((start, text.Length));
        return res;
    }

    private static ParseResult<Expr> ParseSlice(string text, int start, string slice) =>
        Grammar.Parse(new string(' ', start) + slice);

    /** @id CODE-REC-004 @implements REQ-REC-007 */
    private static bool OnlyTrivia(string slice)
    {
        bool inCom = false;
        foreach (var c in slice)
        {
            if (inCom) { if (c == '\n') inCom = false; }
            else if (c == '#') inCom = true;
            else if (!char.IsWhiteSpace(c)) return false;
        }
        return true;
    }

    /** @id CODE-REC-002 @implements REQ-REC-001 REQ-REC-002 REQ-REC-004 REQ-REC-005 */
    public static ProgramResult ParseProgram(string text, int maxDiagnostics)
    {
        var src = new Source(text);
        var stmts = new List<Expr>();
        var diags = new List<Diagnostic>();
        foreach (var (start, end) in Slices(text))
        {
            var slice = text.Substring(start, end - start);
            if (OnlyTrivia(slice)) continue;
            var r = ParseSlice(text, start, slice);
            if (r.Ok) { stmts.Add(r.Value!); continue; }
            diags.Add(new Diagnostic(src.PosAt(r.Error!.Offset), r.Error.Describe(src)));
            stmts.Add(new ErrorStmt(new Span(start, end)));
            if (diags.Count >= maxDiagnostics)
            {
                diags.Add(new Diagnostic(src.PosAt(Math.Min(end + 1, text.Length)), "too many errors; giving up"));
                break;
            }
        }
        return new ProgramResult(stmts, diags);
    }

    /** @id CODE-REC-003 @implements REQ-REC-006 */
    public static string Render(Diagnostic d, string text)
    {
        var src = new Source(text);
        return $"line {d.Pos.Line}, col {d.Pos.Col}: {d.Message}\n{src.LineText(d.Pos.Line)}\n{new string(' ', d.Pos.Col - 1)}^";
    }
}
