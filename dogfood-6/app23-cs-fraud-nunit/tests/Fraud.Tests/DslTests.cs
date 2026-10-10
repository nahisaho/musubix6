using Fraud.Dsl;

namespace Fraud.Tests;

public class DslTests
{
    static readonly Dictionary<string, object?> Ctx = new() { ["amount"] = 150m, ["country"] = "US", ["n"] = 3m };

    static object? Eval(string src, Func<string, object?[], object?>? fn = null) =>
        Evaluator.Eval(Parser.ParseExpr(src), Ctx, fn);

    /** @id TEST-DSL-001 @verifies REQ-DSL-001 */
    [Test]
    public void TEST_DSL_001_lexer_tokens_and_positions()
    {
        var t = Lexer.Tokenize("amount >= 10.5 and country == \"US\"");
        Assert.That(t.Select(x => x.Kind), Is.EqualTo(new[] { TokenKind.Ident, TokenKind.Op, TokenKind.Number, TokenKind.Keyword, TokenKind.Ident, TokenKind.Op, TokenKind.String, TokenKind.Eof }));
        Assert.That(t.Select(x => x.Text).Take(7), Is.EqualTo(new[] { "amount", ">=", "10.5", "and", "country", "==", "US" }));
        Assert.That((t[1].Line, t[1].Col), Is.EqualTo((1, 8)));
        var m = Lexer.Tokenize("a\n  > 1");
        Assert.That((m[1].Line, m[1].Col), Is.EqualTo((2, 3)));
        Assert.That((m[2].Line, m[2].Col), Is.EqualTo((2, 5)));
    }

    /** @id TEST-DSL-002 @verifies REQ-DSL-002 */
    [Test]
    public void TEST_DSL_002_unterminated_string_reports_position()
    {
        var ex = Assert.Throws<DslException>(() => Lexer.Tokenize("x ==\n  \"abc"))!;
        Assert.That((ex.Line, ex.Col), Is.EqualTo((2, 3)));
        var ex2 = Assert.Throws<DslException>(() => Lexer.Tokenize("a # b"))!;
        Assert.That((ex2.Line, ex2.Col), Is.EqualTo((1, 3)));
    }

    /** @id TEST-DSL-003 @verifies REQ-DSL-003 */
    [Test]
    public void TEST_DSL_003_precedence()
    {
        Assert.That(Parser.ParseExpr("a or b and not c == 1 + 2 * 3").Show(), Is.EqualTo("(or a (and b (not (== c (+ 1 (* 2 3))))))"));
        Assert.That(Parser.ParseExpr("a and b or c").Show(), Is.EqualTo("(or (and a b) c)"));
        Assert.That(Parser.ParseExpr("1 - 2 - 3").Show(), Is.EqualTo("(- (- 1 2) 3)"));
        Assert.That(Parser.ParseExpr("8 / 4 / 2").Show(), Is.EqualTo("(/ (/ 8 4) 2)"));
        Assert.That(Parser.ParseExpr("not not a").Show(), Is.EqualTo("(not (not a))"));
    }

    /** @id TEST-DSL-004 @verifies REQ-DSL-004 */
    [Test]
    public void TEST_DSL_004_parentheses_override()
    {
        Assert.That(Parser.ParseExpr("(a or b) and c").Show(), Is.EqualTo("(and (or a b) c)"));
        Assert.That(Parser.ParseExpr("(1 + 2) * 3").Show(), Is.EqualTo("(* (+ 1 2) 3)"));
        Assert.That(Evaluator.Eval(Parser.ParseExpr("(1 + 2) * 3"), Ctx, null), Is.EqualTo(9m));
        Assert.Throws<DslException>(() => Parser.ParseExpr("(a or b"));
        Assert.Throws<DslException>(() => Parser.ParseExpr("a or b)"));
    }

    /** @id TEST-DSL-005 @verifies REQ-DSL-005 */
    [Test]
    public void TEST_DSL_005_rule_declaration()
    {
        var rules = Parser.ParseRules("rule HighAmount weight 30 when amount > 1000\nrule Trusted weight -15 when country in [\"US\"]");
        Assert.That(rules, Has.Count.EqualTo(2));
        Assert.That(rules[0].Name, Is.EqualTo("HighAmount"));
        Assert.That(rules[0].Weight, Is.EqualTo(30));
        Assert.That(rules[0].When.Show(), Is.EqualTo("(> amount 1000)"));
        Assert.That(rules[1].Weight, Is.EqualTo(-15));
        Assert.Throws<DslException>(() => Parser.ParseRules("rule X weight when a"));
        Assert.Throws<DslException>(() => Parser.ParseRules("rule X weight 1.5 when a"));
    }

    /** @id TEST-DSL-006 @verifies REQ-DSL-006 */
    [Test]
    public void TEST_DSL_006_duplicate_rule_names_rejected()
    {
        var ex = Assert.Throws<DslException>(() => Parser.ParseRules("rule A weight 1 when x\nrule a weight 2 when y"))!;
        Assert.That(ex.Message, Does.Contain("duplicate").IgnoreCase);
        Assert.That(ex.Line, Is.EqualTo(2));
        Assert.That(Parser.ParseRules("rule A weight 1 when x\nrule B weight 2 when y"), Has.Count.EqualTo(2));
    }

    /** @id TEST-DSL-007 @verifies REQ-DSL-007 */
    [Test]
    public void TEST_DSL_007_numeric_and_string_comparison()
    {
        Assert.That(Eval("amount > 100"), Is.EqualTo(true));
        Assert.That(Eval("amount >= 150"), Is.EqualTo(true));
        Assert.That(Eval("amount < 150"), Is.EqualTo(false));
        Assert.That(Eval("amount != 150"), Is.EqualTo(false));
        Assert.That(Eval("country == \"US\""), Is.EqualTo(true));
        Assert.That(Eval("country == \"us\""), Is.EqualTo(false));
        Assert.That(Eval("1 + 2 * n"), Is.EqualTo(7m));
        Assert.That(Eval("not (amount > 200) and n == 3"), Is.EqualTo(true));
    }

    /** @id TEST-DSL-008 @verifies REQ-DSL-008 */
    [Test]
    public void TEST_DSL_008_in_list()
    {
        Assert.That(Eval("country in [\"US\", \"CA\"]"), Is.EqualTo(true));
        Assert.That(Eval("country in [\"FR\", \"DE\"]"), Is.EqualTo(false));
        Assert.That(Eval("n in [1, 2, 3]"), Is.EqualTo(true));
        Assert.That(Eval("n in []"), Is.EqualTo(false));
        Assert.That(Eval("missing in [1]"), Is.EqualTo(false));
        Assert.That(Parser.ParseExpr("x in [1, 2]").Show(), Is.EqualTo("(in x [1 2])"));
    }

    /** @id TEST-DSL-009 @verifies REQ-DSL-009 */
    [Test]
    public void TEST_DSL_009_division_by_zero()
    {
        var ex = Assert.Throws<EvalException>(() => Eval("1 / 0"))!;
        Assert.That(ex.Message, Is.EqualTo("division by zero"));
        Assert.Throws<EvalException>(() => Eval("amount / (n - 3)"));
        Assert.That(Eval("5 / 2"), Is.EqualTo(2.5m));
    }

    /** @id TEST-DSL-010 @verifies REQ-DSL-010 */
    [Test]
    public void TEST_DSL_010_missing_field_is_null()
    {
        Assert.That(Eval("missing > 1"), Is.EqualTo(false));
        Assert.That(Eval("missing < 1"), Is.EqualTo(false));
        Assert.That(Eval("missing >= 1"), Is.EqualTo(false));
        Assert.That(Eval("missing == null"), Is.EqualTo(true));
        Assert.That(Eval("amount == null"), Is.EqualTo(false));
        Assert.That(Eval("amount != null"), Is.EqualTo(true));
        Assert.That(Eval("missing != null"), Is.EqualTo(false));
    }

    /** @id TEST-DSL-011 @verifies REQ-DSL-011 */
    [Test]
    public void TEST_DSL_011_duration_literals()
    {
        var t = Lexer.Tokenize("30s 10m 2h 1d");
        Assert.That(t.Take(4).Select(x => x.Kind), Is.All.EqualTo(TokenKind.Duration));
        Assert.That(Eval("30s"), Is.EqualTo(TimeSpan.FromSeconds(30)));
        Assert.That(Eval("10m"), Is.EqualTo(TimeSpan.FromMinutes(10)));
        Assert.That(Eval("2h"), Is.EqualTo(TimeSpan.FromHours(2)));
        Assert.That(Eval("1d"), Is.EqualTo(TimeSpan.FromDays(1)));
        Assert.That(Eval("10m < 1h"), Is.EqualTo(true));
        Assert.Throws<DslException>(() => Lexer.Tokenize("10x"));
    }

    /** @id TEST-DSL-013 @verifies REQ-DSL-013 */
    [Test]
    public void TEST_DSL_013_duration_arithmetic()
    {
        Assert.That(Eval("5s + 1m"), Is.EqualTo(TimeSpan.FromSeconds(65)));
        Assert.That(Eval("1h - 30m"), Is.EqualTo(TimeSpan.FromMinutes(30)));
        Assert.That(Eval("2 * 10m"), Is.EqualTo(TimeSpan.FromMinutes(20)));
        Assert.That(Eval("10m * 3"), Is.EqualTo(TimeSpan.FromMinutes(30)));
        Assert.That(Eval("1m + 30s == 90s"), Is.EqualTo(true));
        Assert.Throws<EvalException>(() => Eval("5s + 1"));
    }

    /** @id TEST-DSL-012 @verifies REQ-DSL-012 */
    [Test]
    public void TEST_DSL_012_function_calls_via_resolver()
    {
        object? Fn(string name, object?[] args) => name == "twice" ? (decimal)args[0]! * 2 : name == "span" ? args[0] : throw new EvalException("unknown function " + name);
        Assert.That(Eval("twice(n + 1) > 7", Fn), Is.EqualTo(true));
        Assert.That(Eval("span(10m)", Fn), Is.EqualTo(TimeSpan.FromMinutes(10)));
        var ex = Assert.Throws<EvalException>(() => Eval("nope(1)", Fn))!;
        Assert.That(ex.Message, Does.Contain("nope"));
        var ex2 = Assert.Throws<EvalException>(() => Eval("nope(1)"))!;
        Assert.That(ex2.Message, Does.Contain("nope"));
        Assert.That(Parser.ParseExpr("f(1, a)").Show(), Is.EqualTo("(call f 1 a)"));
    }
}
