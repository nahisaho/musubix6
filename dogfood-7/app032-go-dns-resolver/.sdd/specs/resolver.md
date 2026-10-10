---
feature: resolver
tier: T2
approval: auto
---
# resolver
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-RESOLVER-001 | When resolving a multi-label name, the resolver shall ask suffix NS questions before the full query. | TEST-RESOLVER-001 |
| REQ-RESOLVER-002 | When following referrals, the resolver shall use only matching in-bailiwick address glue. | TEST-RESOLVER-001 |
| REQ-RESOLVER-003 | When a positive or negative answer is cached, subsequent resolution shall avoid upstream exchanges until the minimum CNAME-chain or answer TTL expires. | TEST-RESOLVER-002, TEST-RESOLVER-005, TEST-RESOLVER-008 |
| REQ-RESOLVER-004 | When an authoritative negative response has SOA, subsequent resolution shall use the negative cache. | TEST-RESOLVER-002 |
| REQ-RESOLVER-005 | If delegation loops or exceeds a bounded step count, resolution shall fail. | TEST-RESOLVER-003 |
| REQ-RESOLVER-006 | If context is cancelled, a response is SERVFAIL, or NXDOMAIN carries positive answers, resolution shall fail without caching. | TEST-RESOLVER-003, TEST-RESOLVER-006 |
| REQ-RESOLVER-007 | When a CNAME is returned, resolution shall chase it or accept bundled reachable terminal records with a bounded loop detector. | TEST-RESOLVER-004, TEST-RESOLVER-007 |
| REQ-RESOLVER-008 | If secure mode is enabled, the resolver shall bypass shared cache, reject unsigned or invalid positive answers including every CNAME link, and cap returned TTLs at proof expiry. | TEST-RESOLVER-004, TEST-RESOLVER-006, TEST-RESOLVER-009 |
## Design
Exchange is an interface with UDP and deterministic fake implementations. Resolution iterates suffixes through referrals.
Cache and optional Validator are injected. Secure mode bypasses shared cache and validates each positive response before following a CNAME.
CNAME and delegation traversal share a total budget; referrals require progress.
## Assumptions
Only address-glued delegations are supported; missing glue fails closed instead of resolving NS addresses recursively.
Negative answers require AA plus SOA. Secure mode intentionally rejects unsupported authenticated denial.
