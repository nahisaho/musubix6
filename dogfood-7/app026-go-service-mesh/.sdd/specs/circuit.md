---
feature: circuit
tier: T2
approval: auto
---
# Circuit state machine
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CIRCUIT-001 | When capacity is available, the system shall admit a request. | TEST-CIRCUIT-001 |
| REQ-CIRCUIT-002 | If concurrent requests reach the configured limit, the system shall reject admission. | TEST-CIRCUIT-001 |
| REQ-CIRCUIT-003 | When a request completes, the system shall release its capacity. | TEST-CIRCUIT-002 |
| REQ-CIRCUIT-004 | When a successful request completes, the system shall reset consecutive failures. | TEST-CIRCUIT-002 |
| REQ-CIRCUIT-005 | If failures reach the threshold, the system shall open the circuit. | TEST-CIRCUIT-003 |
| REQ-CIRCUIT-006 | While the open cooldown is active, the system shall reject admission. | TEST-CIRCUIT-003 |
| REQ-CIRCUIT-007 | When cooldown expires, the system shall admit one half-open probe. | TEST-CIRCUIT-004 |
| REQ-CIRCUIT-008 | While a half-open probe is pending, the system shall reject other probes. | TEST-CIRCUIT-004 |
| REQ-CIRCUIT-009 | When a half-open probe succeeds, the system shall close the circuit. | TEST-CIRCUIT-005 |
| REQ-CIRCUIT-010 | When a half-open probe fails, the system shall restart cooldown. | TEST-CIRCUIT-005 |
## Design
Circuit owns state, consecutive failures, active count and opened-at under a mutex.
State table: closed+threshold=>open; open+cooldown=>half-open; half-open+success=>closed; half-open+failure=>open.
Each admitted request receives an idempotent completion closure to prevent double-release.
Opening increments a generation; late completions release capacity but do not alter newer generation state.
## Assumptions / risks
Fake nondecreasing millisecond time is provided by caller; cooldown boundary is inclusive.
Spike exercises concurrent admission and sync.Once completion.
Configuration limits and thresholds are positive; invalid settings fail construction.
