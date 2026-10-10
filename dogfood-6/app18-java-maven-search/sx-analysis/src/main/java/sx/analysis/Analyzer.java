package sx.analysis;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import sx.core.Token;

public final class Analyzer {
    public static final Set<String> DEFAULT_STOPWORDS =
            Set.of("a", "an", "and", "are", "as", "at", "be", "by", "for", "in", "is", "it", "of", "on", "or", "the", "to");

    private final Set<String> stop;

    public Analyzer(Set<String> stop) {
        this.stop = Set.copyOf(stop);
    }

    public static Analyzer standard() {
        return new Analyzer(DEFAULT_STOPWORDS);
    }

    /** @id CODE-ANALYSIS-008 @implements REQ-ANALYSIS-009 */
    public List<Token> analyze(String text) {
        List<Token> folded = new ArrayList<>();
        for (Token t : Tokenizer.tokenize(text)) {
            folded.add(new Token(Filters.lowercase(Filters.fold(t.term())), t.position()));
        }
        List<Token> out = new ArrayList<>();
        for (Token t : Filters.removeStopwords(folded, stop)) {
            out.add(new Token(Stemmer.stem(t.term()), t.position()));
        }
        return out;
    }
}
