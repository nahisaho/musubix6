package sx.index;

final class EmptyCursor implements PostingsCursor {
    @Override
    public boolean next() {
        return false;
    }

    @Override
    public boolean advance(int target) {
        return false;
    }

    @Override
    public int doc() {
        return NO_MORE;
    }

    @Override
    public int tf() {
        throw new IllegalStateException("empty cursor");
    }

    @Override
    public int[] positions() {
        throw new IllegalStateException("empty cursor");
    }
}
