package sx.index;

import sx.core.Posting;

public interface PostingsCursor {
    int NO_MORE = Integer.MAX_VALUE;

    boolean next();

    boolean advance(int target);

    int doc();

    int tf();

    int[] positions();

    default Posting posting() {
        return new Posting(doc(), positions());
    }
}
