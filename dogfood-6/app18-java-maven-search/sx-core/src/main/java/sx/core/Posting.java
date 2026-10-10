package sx.core;

/** @id CODE-INDEX-001 @implements REQ-INDEX-010 */
public record Posting(int docId, int[] positions) {
    public Posting {
        if (docId < 0) {
            throw new IllegalArgumentException("negative docId: " + docId);
        }
        if (positions == null || positions.length == 0) {
            throw new IllegalArgumentException("a posting needs at least one position");
        }
        for (int i = 0; i < positions.length; i++) {
            if (positions[i] < 0 || (i > 0 && positions[i] <= positions[i - 1])) {
                throw new IllegalArgumentException("positions must be non-negative and strictly increasing");
            }
        }
        positions = positions.clone();
    }

    public int tf() {
        return positions.length;
    }
}
