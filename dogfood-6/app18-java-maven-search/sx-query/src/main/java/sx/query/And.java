package sx.query;

import java.util.List;

public record And(List<Query> children) implements Query {}
