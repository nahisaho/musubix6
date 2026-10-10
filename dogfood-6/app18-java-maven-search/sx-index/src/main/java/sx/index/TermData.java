package sx.index;

/** Open (mutable) postings of one term: parallel arrays, positions flattened. */
final class TermData {
    final IntBuf docs = new IntBuf();
    final IntBuf tfs = new IntBuf();
    final IntBuf positions = new IntBuf();
    Frozen frozen;
    int liveDf;
    long liveCf;
}
