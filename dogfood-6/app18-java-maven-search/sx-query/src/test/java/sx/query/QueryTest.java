package sx.query;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;
import sx.analysis.Analyzer;
import sx.core.Token;

class QueryTest {
    private static final QueryParser P = new QueryParser(Analyzer.standard());

    private static Query t(String s) {
        return new Term(s);
    }

    private static Query and(Query... q) {
        return new And(List.of(q));
    }

    private static Query or(Query... q) {
        return new Or(List.of(q));
    }

    private static Query not(Query q) {
        return new Not(q);
    }

    private static int errorOffset(String q) {
        return assertThrows(QuerySyntaxException.class, () -> P.parse(q)).offset();
    }

    /** @id TEST-QUERY-001 @verifies REQ-QUERY-001 */
    @Test
    void test_query_001_lexer() {
        List<Lexeme> ls = QueryLexer.lex("alpha AND (beta OR \"gamma delta\") NOT and");
        assertEquals(
                List.of(LexKind.WORD, LexKind.AND, LexKind.LPAREN, LexKind.WORD, LexKind.OR, LexKind.PHRASE,
                        LexKind.RPAREN, LexKind.NOT, LexKind.WORD),
                ls.stream().map(Lexeme::kind).toList());
        assertEquals(List.of(0, 6, 10, 11, 16, 19, 32, 34, 38), ls.stream().map(Lexeme::offset).toList());
        assertEquals("gamma delta", ls.get(5).text());
        assertEquals("and", ls.get(8).text());
        assertEquals(List.of(LexKind.WORD), QueryLexer.lex("ANDROID").stream().map(Lexeme::kind).toList());
    }

    /** @id TEST-QUERY-002 @verifies REQ-QUERY-002 */
    @Test
    void test_query_002_precedence() {
        assertEquals(or(t("alpha"), and(t("beta"), t("gamma"))), P.parse("alpha OR beta AND gamma"));
        assertEquals(or(and(t("alpha"), t("beta")), t("gamma")), P.parse("alpha AND beta OR gamma"));
        assertEquals(and(t("alpha"), not(t("beta"))), P.parse("alpha AND NOT beta"));
        assertEquals(and(not(t("alpha")), t("beta")), P.parse("NOT alpha AND beta"));
        assertEquals(and(t("alpha"), t("beta"), t("gamma")), P.parse("alpha AND beta AND gamma"));
    }

    /** @id TEST-QUERY-003 @verifies REQ-QUERY-003 */
    @Test
    void test_query_003_implicit_and() {
        assertEquals(and(t("alpha"), t("beta")), P.parse("alpha beta"));
        assertEquals(and(t("alpha"), not(t("beta"))), P.parse("alpha NOT beta"));
        assertEquals(or(and(t("alpha"), t("beta")), t("gamma")), P.parse("alpha beta OR gamma"));
        assertEquals(and(t("alpha"), or(t("beta"), t("gamma"))), P.parse("alpha (beta OR gamma)"));
    }

    /** @id TEST-QUERY-004 @verifies REQ-QUERY-004 */
    @Test
    void test_query_004_parentheses() {
        assertEquals(and(or(t("alpha"), t("beta")), t("gamma")), P.parse("(alpha OR beta) AND gamma"));
        assertEquals(not(or(t("alpha"), t("beta"))), P.parse("NOT (alpha OR beta)"));
        assertEquals(t("alpha"), P.parse("((alpha))"));
    }

    /** @id TEST-QUERY-005 @verifies REQ-QUERY-005 */
    @Test
    void test_query_005_phrase() {
        assertEquals(new Phrase(List.of(new Token("quick", 0), new Token("fox", 1))), P.parse("\"quick fox\""));
        assertEquals(new Phrase(List.of(new Token("over", 0), new Token("lazy", 2))), P.parse("\"over the lazy\""));
        assertEquals(t("quick"), P.parse("\"the quick\""));
        assertEquals(and(t("alpha"), new Phrase(List.of(new Token("beta", 0), new Token("gamma", 1)))),
                P.parse("alpha \"Beta   GAMMA\""));
    }

    /** @id TEST-QUERY-006 @verifies REQ-QUERY-006 */
    @Test
    void test_query_006_unbalanced_parens() {
        assertEquals(0, errorOffset("(alpha"));
        assertEquals(5, errorOffset("alpha)"));
        assertEquals(6, errorOffset("alpha (beta OR gamma"));
        assertEquals(0, errorOffset("((alpha)"));
        assertEquals(0, errorOffset(")"));
        assertEquals(8, errorOffset("(alpha) )"));
    }

    /** @id TEST-QUERY-007 @verifies REQ-QUERY-007 */
    @Test
    void test_query_007_unterminated_quote() {
        assertEquals(6, errorOffset("alpha \"beta gamma"));
        assertEquals(0, errorOffset("\""));
        assertEquals(6, assertThrows(QuerySyntaxException.class, () -> QueryLexer.lex("alpha \"beta")).offset());
    }

    /** @id TEST-QUERY-008 @verifies REQ-QUERY-008 */
    @Test
    void test_query_008_invalid_shapes() {
        assertEquals(0, errorOffset(""));
        assertEquals(0, errorOffset("   "));
        assertEquals(0, errorOffset("the"));
        assertEquals(0, errorOffset("the of"));
        assertEquals(9, errorOffset("alpha AND"));
        assertEquals(0, errorOffset("AND alpha"));
        assertEquals(8, errorOffset("alpha OR"));
        assertEquals(10, errorOffset("alpha AND OR beta"));
        assertEquals(3, errorOffset("NOT"));
        assertEquals(0, errorOffset("NOT the"));
        assertEquals(0, errorOffset("\"the of\""));
    }

    /** @id TEST-QUERY-009 @verifies REQ-QUERY-009 */
    @Test
    void test_query_009_simplify() {
        assertEquals(t("a"), Simplifier.simplify(not(not(t("a")))));
        assertEquals(not(t("a")), Simplifier.simplify(not(not(not(t("a"))))));
        assertEquals(and(t("a"), t("b"), t("c")), Simplifier.simplify(and(and(t("a"), t("b")), t("c"))));
        assertEquals(or(t("a"), t("b"), t("c")), Simplifier.simplify(or(t("a"), or(t("b"), t("c")))));
        assertEquals(t("a"), Simplifier.simplify(and(t("a"))));
        assertEquals(t("a"), Simplifier.simplify(or(and(t("a")))));
        assertEquals(or(t("a"), and(t("b"), t("c"))), Simplifier.simplify(or(t("a"), and(t("b"), t("c")))));
        assertEquals(not(and(t("a"), t("b"))), Simplifier.simplify(not(and(and(t("a")), t("b")))));
    }

    /** @id TEST-QUERY-010 @verifies REQ-QUERY-010 */
    @Test
    void test_query_010_word_analysis() {
        assertEquals(t("run"), P.parse("Running"));
        assertEquals(t("cafe"), P.parse("Caf\u00e9"));
        assertEquals(t("poni"), P.parse("ponies"));
        assertEquals(new Phrase(List.of(new Token("wi", 0), new Token("fi", 1))), P.parse("wi-fi"));
        assertEquals(and(t("run"), t("fox")), P.parse("running FOX"));
    }

    /** @id TEST-QUERY-011 @verifies REQ-QUERY-011 */
    @Test
    void test_query_011_stopword_operands_dropped() {
        assertEquals(t("alpha"), P.parse("the AND alpha"));
        assertEquals(t("alpha"), P.parse("alpha OR the"));
        assertEquals(t("alpha"), P.parse("alpha NOT the"));
        assertEquals(t("alpha"), P.parse("NOT the alpha"));
        assertEquals(t("alpha"), P.parse("alpha AND (the OR of)"));
        assertEquals(and(t("alpha"), t("beta")), P.parse("alpha the beta"));
    }
}
