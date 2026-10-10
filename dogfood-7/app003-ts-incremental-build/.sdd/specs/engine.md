---
feature: engine
tier: T2
approval: auto
---
# Incremental build sessions
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ENGINE-001 | When targets build, the engine shall execute their dependency closure and return target artifacts. | TEST-ENGINE-001 |
| REQ-ENGINE-002 | When unchanged targets rebuild, the engine shall reuse cache entries without executing actions. | TEST-ENGINE-002 |
| REQ-ENGINE-003 | When an upstream version changes without changing its output, the engine shall cut off downstream actions early. | TEST-ENGINE-003 |
| REQ-ENGINE-004 | When an upstream output changes, the engine shall rebuild its transitive consumers. | TEST-ENGINE-004 |
| REQ-ENGINE-005 | When a task version changes, the engine shall invalidate that task even if dependencies are unchanged. | TEST-ENGINE-005 |
| REQ-ENGINE-006 | If actions fail, then the engine shall not cache failures and shall permit a successful retry. | TEST-ENGINE-006 |
| REQ-ENGINE-007 | When independent engine tasks build, the engine shall honor executor concurrency and fake time. | TEST-ENGINE-007 |
| REQ-ENGINE-008 | If overlapping builds or updates are attempted, then the engine shall reject them without corrupting the active session. | TEST-ENGINE-008 |
| REQ-ENGINE-009 | When artifact metadata hooks are configured, the engine shall store post-action metadata and notify the consumer on cache hits. | TEST-ENGINE-009 |
## Design
Engine composes Graph, Executor and ArtifactCache. Version plus prerequisite-ID/output-hash pairs sorted by ID is the lookup key.
Only action success publishes artifacts; equal output hashes stop downstream invalidation. Builds are exclusive.
Actions receive copied prerequisite outputs; task declarations have immutable identity and explicitly updateable versions.
Optional metadata hooks let dynamic actions store observed read sets in the same bounded cache entry as their output.
## Assumptions
Actions are deterministic for version and all declared input hashes; external input changes require a version update.
Cancelled sessions cannot publish results after cancellation; partial independent successes may remain cached.
