---
feature: ssr
tier: T2
approval: auto
---
# ssr
Goal: deterministic reactive UI ssr. Non-goals: browser bundling, hydration, async effects.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SSR-001 | When elements and text are rendered, SSR shall produce deterministic HTML. | TEST-SSR-001 |
| REQ-SSR-002 | When text contains markup characters, SSR shall escape ampersands and angle brackets. | TEST-SSR-002 |
| REQ-SSR-003 | When attributes contain quotes or markup, SSR shall escape their values. | TEST-SSR-003 |
| REQ-SSR-004 | When event handlers or key props are supplied, SSR shall omit them. | TEST-SSR-004 |
| REQ-SSR-005 | When boolean attributes are supplied, SSR shall include true and omit false. | TEST-SSR-005 |
| REQ-SSR-006 | When a void element has children, SSR shall reject the invalid element. | TEST-SSR-006 |
| REQ-SSR-007 | When style objects are supplied, SSR shall render sorted kebab-case declarations. | TEST-SSR-007 |
| REQ-SSR-008 | When tag or attribute names are unsafe, SSR shall reject them. | TEST-SSR-008 |
| REQ-SSR-009 | When URL attributes use javascript or vbscript schemes after whitespace normalization, SSR shall reject them. | TEST-SSR-009 |
| REQ-SSR-010 | When a signal-backed component is rendered, SSR shall return a snapshot without subscribing to signals. | TEST-SSR-010 |
| REQ-SSR-011 | When an attribute value requires coercion, SSR shall coerce once and validate the exact serialized string. | TEST-SSR-011 |
| REQ-SSR-012 | When unsupported script or style raw-text elements are supplied, SSR shall reject them instead of corrupting content through HTML entity escaping. | TEST-SSR-012 |

## Design
A pure recursive renderer serializes immutable VNodes under untrack; attribute policy rejects dangerous names and executable URLs.
Void tags and style formatting are centralized; text and attributes use separate escaping rules.

## Assumptions / risks
Node 24 executes erasable TypeScript directly (spike: .sdd/spikes/runtime.mjs).
Map insertion order and queueMicrotask preserve deterministic ordering (same spike).
Views and effects are synchronous; the host is exclusive to the mount; event callbacks are client-only.
