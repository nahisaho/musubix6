namespace ParserKit;

public readonly record struct Pos(int Offset, int Line, int Col)
{
    public override string ToString() => $"{Line}:{Col}";
}

public sealed class Source
{
    private readonly List<int> _lineStarts = new() { 0 };

    public Source(string text)
    {
        Text = text;
        for (int i = 0; i < text.Length; i++)
            if (text[i] == '\n') _lineStarts.Add(i + 1);
    }

    public string Text { get; }
    public int Length => Text.Length;
    public int LineCount => _lineStarts.Count;

    /** @id CODE-SRC-001 @implements REQ-SRC-001 REQ-SRC-002 REQ-SRC-003 REQ-SRC-004 REQ-SRC-006 */
    public Pos PosAt(int offset)
    {
        if (offset < 0 || offset > Text.Length) throw new ArgumentOutOfRangeException(nameof(offset));
        int idx = _lineStarts.BinarySearch(offset);
        if (idx < 0) idx = ~idx - 1;
        return new Pos(offset, idx + 1, offset - _lineStarts[idx] + 1);
    }

    /** @id CODE-SRC-002 @implements REQ-SRC-005 */
    public string LineText(int line)
    {
        if (line < 1 || line > _lineStarts.Count) throw new ArgumentOutOfRangeException(nameof(line));
        int start = _lineStarts[line - 1];
        int end = line < _lineStarts.Count ? _lineStarts[line] - 1 : Text.Length;
        if (end > start && Text[end - 1] == '\r') end--;
        return Text.Substring(start, end - start);
    }
}
