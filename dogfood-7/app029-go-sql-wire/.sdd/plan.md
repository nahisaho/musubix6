# Wire-lite delivery
| order | feature | depends | note |
| --- | --- | --- | --- |
| 1 | wire | | Framing and typed payloads |
| 2 | tx | wire | Transaction policy table |
| 3 | query | tx | Prepared statements and resumable portals |
| 4 | auth | wire | Explicit local trust allowlist, no passwords |
| 5 | session | wire, tx, query, auth | Real connection handshake and protocol |
