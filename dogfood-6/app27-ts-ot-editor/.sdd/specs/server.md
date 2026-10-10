---
feature: server
tier: T2
approval: auto
---
# server
Goal: authoritative server that reconciles concurrent client ops into one linear history.  Non-goals: networking, auth, persistence.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SERVER-001 | The system shall start with the given document, rev 0 and empty history. | TEST-SERVER-001 |
| REQ-SERVER-002 | When receive() gets an op with baseRev == rev, the system shall apply it, increment rev and ack with the new rev. | TEST-SERVER-002 |
| REQ-SERVER-003 | When receive() gets an op with baseRev < rev, the system shall transform it against history[baseRev..rev) with the history op winning ties, apply the result and return it. | TEST-SERVER-003 |
| REQ-SERVER-004 | If baseRev > rev or baseRev is negative or not an integer, then receive shall reject with code "bad-rev" and leave state unchanged. | TEST-SERVER-004 |
| REQ-SERVER-005 | If baseRev < minRev (compacted), then receive shall reject with code "stale-rev". | TEST-SERVER-005 |
| REQ-SERVER-006 | If the op is invalid or its baseLength differs from the document length at baseRev, then receive shall reject with code "bad-op" and leave state unchanged. | TEST-SERVER-006 |
| REQ-SERVER-007 | When a (clientId, seq) equal to the client's last accepted seq is received again, the system shall return the previous ack without applying it again. | TEST-SERVER-007 |
| REQ-SERVER-008 | If seq is neither lastSeq nor lastSeq+1 for that client, then receive shall reject with code "bad-seq". | TEST-SERVER-008 |
| REQ-SERVER-009 | When compact(minRev) is called with minRev <= rev, the system shall drop older history, and shall throw RangeError for minRev > rev. | TEST-SERVER-009 |
| REQ-SERVER-010 | When opsSince(rev) is called, the system shall return the history ops from rev, and shall throw for rev < minRev or rev > current. | TEST-SERVER-010 |
| REQ-SERVER-011 | When an op is accepted, the system shall call each subscriber exactly once with {rev, op, origin, seq}; rejected and duplicate ops shall not notify. | TEST-SERVER-011 |
| REQ-SERVER-012 | While a transformed op is a no-op, the system shall still consume a revision. | TEST-SERVER-012 |
| REQ-SERVER-013 | When a duplicate (clientId, seq) arrives, the system shall return the cached ack even if its baseRev has since been compacted. | TEST-SERVER-013 |

## Design
Server = {doc, rev, minRev, history: Op[] (history[i] produced rev i+1, offset by minRev), clients: Map<id,{lastSeq, lastAck}>}.
| Input state | baseRev | seq | Outcome |
| --- | --- | --- | --- |
| any | <minRev | * | reject stale-rev |
| any | >rev or non-int | * | reject bad-rev |
| lastSeq=n | ok | n | duplicate: cached ack |
| lastSeq=n | ok | n+1 | transform, apply, rev+1 |
| lastSeq=n | ok | other | reject bad-seq |
Invariants: rev == minRev + history.length; doc == fold(apply, initial, all history) when minRev==0; rejected input never mutates state.
Order of checks: duplicate seq (cached ack), baseRev range, stale, seq, then op validity/length.
## Assumptions / risks
Transform ties: history op is the first argument so a server-side op always wins over the late client op; client mirrors this (client feature).
