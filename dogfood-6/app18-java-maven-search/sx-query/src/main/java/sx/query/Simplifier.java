package sx.query;

import java.util.ArrayList;
import java.util.List;

public final class Simplifier {
    private Simplifier() {}

    /** @id CODE-QUERY-004 @implements REQ-QUERY-009 */
    public static Query simplify(Query q) {
        return switch (q) {
            case Term t -> t;
            case Phrase p -> p;
            case Not n -> {
                Query inner = simplify(n.child());
                yield inner instanceof Not nn ? nn.child() : new Not(inner);
            }
            case And a -> combine(a.children(), true);
            case Or o -> combine(o.children(), false);
        };
    }

    private static Query combine(List<Query> children, boolean and) {
        List<Query> flat = new ArrayList<>();
        for (Query c : children) {
            Query s = simplify(c);
            if (and && s instanceof And sa) {
                flat.addAll(sa.children());
            } else if (!and && s instanceof Or so) {
                flat.addAll(so.children());
            } else {
                flat.add(s);
            }
        }
        if (flat.size() == 1) {
            return flat.get(0);
        }
        return and ? new And(flat) : new Or(flat);
    }
}
