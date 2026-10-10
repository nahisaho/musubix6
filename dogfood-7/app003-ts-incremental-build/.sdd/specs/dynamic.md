---
feature: dynamic
tier: T2
approval: auto
---
# Dynamic dependency discovery
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-DYNAMIC-001 | When an action reads an undeclared task, the dynamic engine shall build it and retry discovery before publishing. | TEST-DYNAMIC-001 |
| REQ-DYNAMIC-002 | If an action reads an unknown task, then the build shall fail without publishing that action. | TEST-DYNAMIC-002 |
| REQ-DYNAMIC-003 | If discoveries introduce a cycle, then the build shall reject it atomically. | TEST-DYNAMIC-003 |
| REQ-DYNAMIC-004 | When a successful rerun stops reading an earlier dynamic dependency, the engine shall remove that edge. | TEST-DYNAMIC-004 |
| REQ-DYNAMIC-005 | When a discovered dependency changes, its consumers shall invalidate using the new content hash. | TEST-DYNAMIC-005 |
| REQ-DYNAMIC-006 | If discovery exceeds a finite retry bound, then the engine shall fail with a stabilization error. | TEST-DYNAMIC-006 |
| REQ-DYNAMIC-007 | When discovered and static dependencies overlap, the graph shall retain the static dependency exactly once. | TEST-DYNAMIC-007 |
| REQ-DYNAMIC-008 | When dynamic builds run again unchanged, cached consumers shall retain their discovered dependency sets. | TEST-DYNAMIC-008 |
| REQ-DYNAMIC-009 | When a prior version is revisited, a cached artifact shall restore its exact observed reads rather than retain obsolete discovery edges. | TEST-DYNAMIC-009 |
| REQ-DYNAMIC-010 | When a caller supplies a shared cache, successful sessions shall publish into that cache while failed sessions shall leave it unchanged. | TEST-DYNAMIC-010 |
## Design
DynamicEngine adapts Engine actions with synchronous read(id); missing reads throw a discovery signal.
Discovery replaces a candidate union of static/discovered edges, validates it, builds the widened closure and retries.
Successful runs publish exact observed dynamic sets; failed attempts never cache consumer output.
The entire discovery session is transactional: candidate edges and cache entries publish only on stabilization; any failure rolls back all discovery rounds.
Exact dynamic reads are metadata on each cached artifact, restored by Engine hit hooks; cache publication preserves supplied-cache identity.
## Assumptions
Actions are pure and retry-safe, read is synchronous, and incomplete runs may discover only one missing task each.
Dynamic removal requires the consumer's version or a current dependency output to change; default retry bound is 32.
