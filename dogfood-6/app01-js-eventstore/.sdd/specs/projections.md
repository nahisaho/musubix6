---
feature: projections
tier: T2
approval: auto
---
# projections
Goal: CQRS read models built from the global event log. Depends on store, inventory, orders event shapes.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-PROJ-001 | When catchUp runs, the system shall apply store events after the checkpoint in globalSeq order to the read-model reducer. | TEST-PROJ-001 |
| REQ-PROJ-002 | When catchUp completes, the system shall advance the checkpoint to the last applied globalSeq and return the number applied. | TEST-PROJ-002 |
| REQ-PROJ-003 | When catchUp runs twice with no new events, the system shall not re-apply any event. | TEST-PROJ-003 |
| REQ-PROJ-004 | When rebuild runs, the system shall reset the model and checkpoint and replay all events. | TEST-PROJ-004 |
| REQ-PROJ-005 | The stockLevels projection shall expose onHand, reserved and available per sku from inventory events. | TEST-PROJ-005 |
| REQ-PROJ-006 | The orderSummaries projection shall expose status and item count per orderId from order events. | TEST-PROJ-006 |
| REQ-PROJ-007 | If a reducer throws on an event, then catchUp shall rethrow and leave the checkpoint at the last successfully applied event. | TEST-PROJ-007 |

## Design
Projector({store, reducer, initial}) keeps model + checkpoint (globalSeq). catchUp: events = store.readAll(checkpoint); for each: model = reducer(model, ev); checkpoint = ev.globalSeq after success.
stockLevels reducer keys by data.sku (inventory events carry data.sku); orderSummaries keys by data.orderId. Inventory ship/release events carry sku and qty so the projection needs no lookup.
Cross-feature: relies on store.readAll and event type names from inventory/orders.
## Assumptions / risks
Projections are eventually consistent; tests drive catchUp explicitly.
