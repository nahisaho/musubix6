---
feature: probe
tier: T2
approval: auto
---
# Probe
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PROBE-001 | When the probe runs, the system shall return true. | TEST-PROBE-001 |
## Design
Independent review must contain zero unresolved findings before locking.
Boolean probe isolates review validation from application behavior.
