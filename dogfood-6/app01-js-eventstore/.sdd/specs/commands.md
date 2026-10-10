---
feature: commands
tier: T2
approval: auto
---
# commands
Goal: idempotent command handling with optimistic-concurrency retry. Depends on store, snapshots, inventory, orders.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CMD-001 | When handle(cmd) succeeds, the system shall decide against the loaded aggregate and append the events at the loaded version, returning {events, version}. | TEST-CMD-001 |
| REQ-CMD-002 | When a command with an already processed commandId is handled, the system shall return the original result without appending. | TEST-CMD-002 |
| REQ-CMD-003 | If append raises ConcurrencyError, then the system shall reload the aggregate and retry up to maxRetries times. | TEST-CMD-003 |
| REQ-CMD-004 | If retries are exhausted, then the system shall throw ConcurrencyError. | TEST-CMD-004 |
| REQ-CMD-005 | If decide throws a DomainError, then the system shall append nothing and shall not mark the commandId as processed. | TEST-CMD-005 |
| REQ-CMD-006 | If the command type is unknown, then the system shall throw UnknownCommandError. | TEST-CMD-006 |
| REQ-CMD-007 | If a command lacks a string commandId, then the system shall throw TypeError. | TEST-CMD-007 |
| REQ-CMD-008 | When a snapshot store and interval are configured, the system shall snapshot the aggregate after the append once the interval is reached. | TEST-CMD-008 |
| REQ-CMD-009 | The system shall route inventory-* commands to the inventory aggregate and order-* commands to the orders aggregate using stream ids inventory-<sku> and order-<orderId>. | TEST-CMD-009 |
| REQ-CMD-010 | If the aggregate key (sku or orderId) of a command is not a non-empty string, then the system shall throw TypeError and append nothing (bug: it previously wrote to stream inventory-undefined). | TEST-CMD-010 |

## Design
CommandHandler({store, snapshots?, interval?, maxRetries=3}). handle(cmd): validate -> idempotency check via store.findByCommandId(commandId) -> route -> loop{load via loadAggregate; events=decide; append(stream, version, events with meta.commandId); on ConcurrencyError retry}.
Idempotency is derived from the event log (meta.commandId), so it survives handler restarts; result replay returns stored events and last version.
Routing table: type prefix -> {aggregate module, streamId(cmd)}. Command shape {commandId, type, sku|orderId, ...}.
## Assumptions / risks
Failed (domain-rejected) commands leave no trace so a client may retry after fixing state.
