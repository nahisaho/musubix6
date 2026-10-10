package sx.query;

public sealed interface Query permits Term, Phrase, And, Or, Not {}
