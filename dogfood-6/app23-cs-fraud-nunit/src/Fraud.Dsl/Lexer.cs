using System.Text;

namespace Fraud.Dsl;

public static class Lexer
{
    static readonly HashSet<string> Keywords = new() { "and", "or", "not", "in", "rule", "weight", "when", "null" };
    static readonly string[] TwoCharOps = { ">=", "<=", "==", "!=" };
    const string OneCharOps = "<>+-*/()[],";

    /** @id CODE-DSL-001 @implements REQ-DSL-001 REQ-DSL-002 REQ-DSL-011 */
    public static IReadOnlyList<Token> Tokenize(string src)
    {
        var tokens = new List<Token>();
        int i = 0, line = 1, col = 1;
        void Adv(int n) { for (int k = 0; k < n; k++) { if (src[i] == '\n') { line++; col = 1; } else col++; i++; } }
        while (i < src.Length)
        {
            var c = src[i];
            if (char.IsWhiteSpace(c)) { Adv(1); continue; }
            int tl = line, tc = col;
            if (char.IsDigit(c))
            {
                int j = i;
                while (j < src.Length && char.IsDigit(src[j])) j++;
                if (j + 1 < src.Length && src[j] == '.' && char.IsDigit(src[j + 1])) { j++; while (j < src.Length && char.IsDigit(src[j])) j++; }
                var text = src[i..j];
                if (j < src.Length && char.IsLetter(src[j]))
                {
                    var unit = src[j];
                    var end = j + 1;
                    if (!"smhd".Contains(unit) || (end < src.Length && char.IsLetterOrDigit(src[end]))) throw new DslException($"bad number suffix near '{src[i..Math.Min(src.Length, end + 1)]}'", tl, tc);
                    tokens.Add(new Token(TokenKind.Duration, src[i..end], tl, tc));
                    Adv(end - i);
                    continue;
                }
                tokens.Add(new Token(TokenKind.Number, text, tl, tc));
                Adv(j - i);
            }
            else if (char.IsLetter(c) || c == '_')
            {
                int j = i;
                while (j < src.Length && (char.IsLetterOrDigit(src[j]) || src[j] == '_')) j++;
                var text = src[i..j];
                tokens.Add(new Token(Keywords.Contains(text) ? TokenKind.Keyword : TokenKind.Ident, text, tl, tc));
                Adv(j - i);
            }
            else if (c == '"')
            {
                var sb = new StringBuilder();
                int j = i + 1;
                var closed = false;
                while (j < src.Length)
                {
                    if (src[j] == '\\' && j + 1 < src.Length) { sb.Append(src[j + 1]); j += 2; continue; }
                    if (src[j] == '"') { closed = true; break; }
                    sb.Append(src[j]);
                    j++;
                }
                if (!closed) throw new DslException("unterminated string literal", tl, tc);
                tokens.Add(new Token(TokenKind.String, sb.ToString(), tl, tc));
                Adv(j + 1 - i);
            }
            else if (i + 1 < src.Length && TwoCharOps.Contains(src.Substring(i, 2)))
            {
                tokens.Add(new Token(TokenKind.Op, src.Substring(i, 2), tl, tc));
                Adv(2);
            }
            else if (OneCharOps.Contains(c))
            {
                tokens.Add(new Token(TokenKind.Op, c.ToString(), tl, tc));
                Adv(1);
            }
            else throw new DslException($"unexpected character '{c}'", tl, tc);
        }
        tokens.Add(new Token(TokenKind.Eof, "", line, col));
        return tokens;
    }
}
