package sx.query;

import java.util.List;
import sx.core.Token;

public record Phrase(List<Token> tokens) implements Query {}
