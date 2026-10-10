package sx.query;

import java.util.List;

public record Or(List<Query> children) implements Query {}
