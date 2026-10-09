# Contract template (≤30 lines)

```md
# <feature> contract
Goal: <one sentence>
Non-goals: <bullets>
Tier: T1|T2   Contract hash: <sha256 of this file, T2 only>

| ID | EARS requirement | Verify (command or TEST ID) |
| --- | --- | --- |
| REQ-F-001 | When <trigger>, the system shall <response>. | `pnpm test -t TEST-F-001` |
| REQ-F-002 | While <state>, the system shall <behavior>. | TEST-F-002 |
| REQ-F-003 | If <error>, then the system shall <recovery>. | TEST-F-003 |

Risks / assumptions: <≤3 bullets, each with the spike or test that retires it>
```

Annotations:
```ts
/** @id CODE-F-001 @implements REQ-F-001 */
/** @id TEST-F-001 @verifies REQ-F-001 */
```
IDs are globally unique. Every REQ needs ≥1 test; every test links to a REQ.
Hash (T2): `sha256sum docs/contract/<feature>.md`.
