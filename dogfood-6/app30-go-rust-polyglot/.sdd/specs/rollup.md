---
feature: rollup
tier: T2
---
# rollup
Goal: Go multi-tier (1m→5m→1h) rollup engine with histogram cells, watermark-driven rolling, late amendment, retention and cardinality cap.   Non-goals: persistence, distribution.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ROLLUP-001 | When Add is called with a point, the system shall update count, sum, min, max and the contract bucket histogram of the 1m cell of that series. | TEST-ROLLUP-001 |
| REQ-ROLLUP-002 | The Align function shall floor a timestamp to a multiple of the tier seconds, also for negative timestamps. | TEST-ROLLUP-002 |
| REQ-ROLLUP-003 | If adding a point would create more than maxSeries series, then Add shall return ErrCardinality while existing series continue to be accepted. | TEST-ROLLUP-003 |
| REQ-ROLLUP-004 | When Roll is called, the system shall merge each child cell exactly once into its parent for every parent bucket whose end <= the watermark (max timestamp seen); calling Roll twice shall not change the result. | TEST-ROLLUP-004 |
| REQ-ROLLUP-005 | For every rolled parent the count, sum and histogram shall equal the totals of its children. | TEST-ROLLUP-005 |
| REQ-ROLLUP-006 | If a sum or count would exceed math.MaxUint64, then the cell shall saturate at MaxUint64 and set Saturated instead of wrapping, and Saturated shall propagate to parents. | TEST-ROLLUP-006 |
| REQ-ROLLUP-007 | The Quantile function shall return the upper bound of the bucket holding rank ceil(q*count), clamped to max, ErrEmpty for an empty cell and ErrQuantile for q outside [0,1] or NaN. | TEST-ROLLUP-007 |
| REQ-ROLLUP-008 | When a point arrives for a child cell that was already rolled and its parent is still retained, the system shall amend the parent by the point's delta and keep conservation; otherwise it shall return ErrLate. | TEST-ROLLUP-008 |
| REQ-ROLLUP-009 | When Evict(now) is called, the system shall delete only cells whose end plus tier retention is <= now and that are rolled (or in the top tier), and return the number evicted; when the last cell of a series is deleted the system shall free its cardinality slot. | TEST-ROLLUP-009 |
| REQ-ROLLUP-010 | The Snapshot shall list non-empty cells ordered by series key, tier, start and be deterministic. | TEST-ROLLUP-010 |
| REQ-ROLLUP-011 | When many goroutines call Add concurrently, the result shall equal the sequential result. | TEST-ROLLUP-011 |
| REQ-ROLLUP-012 | The system shall never mix points of different series in one cell. | TEST-ROLLUP-012 |
| REQ-ROLLUP-013 | If a point's timestamp is so close to the int64 limits that the end of its top-tier bucket would overflow, then Add shall return ErrRange without mutating state (bug fix: wrapped bucket ends made Roll and Evict misbehave). | TEST-ROLLUP-013 |

## Design
Components: `rollup.Engine{cfg, opts, mu, cells map[cellKey]*Cell, series set, wm}`; `cellKey{series, tier, start}`; `Cell{Count,Sum,Min,Max,Hist map[int]uint64,Saturated,Rolled}`. Ingest points feed Add; contract provides tiers, maxSeries and bucket math.

| Cell state | Add (tier 0) | Roll(wm) | Evict(now) |
| --- | --- | --- | --- |
| Open (end > wm) | update | stays | stays |
| Complete, not rolled | late update allowed | merge into parent, Rolled | kept |
| Rolled | amend parent by delta (if parent exists) else ErrLate | skip | deleted if retention passed |
| Top tier | n/a | n/a | deleted if retention passed |

Invariants: parent.count == sum(children.count) for rolled parents; Saturated is sticky; each child counted at most once into its parent (Rolled flag); histogram sum == count unless Saturated.
Decision: single mutex; retention defaults 2h/1d/30d via Options.
## Assumptions / risks: map iteration order randomness (Snapshot sorts; TEST-ROLLUP-010); evicting an unrolled cell would lose data (TEST-ROLLUP-009).
