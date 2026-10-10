---
feature: window
tier: T2
---
# window
Goal: Rust tumbling/sliding window aggregator over integer timestamps with watermark and allowed lateness, feeding hist.   Non-goals: session windows, persistence.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-WINDOW-001 | If size or slide is not positive, slide exceeds size, or size is not a multiple of slide, then WindowSpec::new shall return Err(BadSpec). | TEST-WINDOW-001 |
| REQ-WINDOW-002 | For a tumbling spec, window_starts(ts) shall return the single start floor(ts/size)*size using floor semantics for negative ts. | TEST-WINDOW-002 |
| REQ-WINDOW-003 | For a sliding spec, window_starts(ts) shall return all size/slide starts s (ascending, multiples of slide) with s <= ts < s+size. | TEST-WINDOW-003 |
| REQ-WINDOW-004 | If a window end would overflow i64, then window_starts and observe shall return Err(Overflow) without panicking or changing state. | TEST-WINDOW-004 |
| REQ-WINDOW-005 | When observe(ts, v) is called, the system shall add v to count, sum, min, max and the histogram of every open window containing ts. | TEST-WINDOW-005 |
| REQ-WINDOW-006 | The watermark shall be None before the first observation, then max observed ts minus allowed lateness (saturating), and shall never decrease. | TEST-WINDOW-006 |
| REQ-WINDOW-007 | When take_closed is called, the system shall return each window with end <= watermark exactly once, in ascending start order. | TEST-WINDOW-007 |
| REQ-WINDOW-008 | When every window of an event is already closed, observe shall return Late, increment late_count and not reopen a window; when only some are closed it shall return PartiallyLate and update the open ones. | TEST-WINDOW-008 |
| REQ-WINDOW-009 | When flush is called, the system shall close all open windows in ascending order and treat later events for those windows as late. | TEST-WINDOW-009 |
| REQ-WINDOW-010 | Windows that received no events shall never be emitted, and a timestamp gap of 10^12 windows shall not cause iteration over the gap. | TEST-WINDOW-010 |
| REQ-WINDOW-011 | For every emitted window the histogram count shall equal count and the histogram sum shall equal sum. | TEST-WINDOW-011 |

## Design
Components: `WindowSpec{size,slide}`, `Aggregator{spec, lateness, open: BTreeMap<i64, Acc>, max_ts, closed_until, late}`; Acc = count,sum,min,max,Histogram (from hist).

| Window state | Event inside | Watermark passes end | flush |
| --- | --- | --- | --- |
| absent | create Open | n/a | n/a |
| Open | update | Closed (queued for take_closed) | Closed |
| Closed/emitted | rejected as late | n/a | n/a |

Rule: a window is closed for an event when start+size <= watermark_before_event or <= closed_until (flush). Watermark = max_ts - lateness, saturating.
Invariants: emitted starts strictly ascending across calls; each start emitted once; count == hist.count; empty windows absent (BTreeMap holds only touched windows).
Decision: first compute starts via checked arithmetic so overflow aborts before any mutation.
## Assumptions / risks: i64::MIN/MAX timestamps (retired by TEST-WINDOW-004); out-of-order floods (TEST-WINDOW-006/008).
