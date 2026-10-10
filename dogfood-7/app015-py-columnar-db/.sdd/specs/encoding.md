---
feature: encoding
tier: T2
approval: auto
---
# Encoding
Goal: lossless immutable scalar column compression. Non-goals: persistence and mixed-type ordering.
| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ENC-001 | When dictionary encoding is requested, the engine shall assign stable first-occurrence codes including nulls. | TEST-ENC-001 |
| REQ-ENC-002 | When a dictionary payload is decoded, the engine shall reconstruct every value and reject invalid codes. | TEST-ENC-002 |
| REQ-ENC-003 | When RLE encoding is requested, the engine shall coalesce adjacent equal values and support empty input. | TEST-ENC-003 |
| REQ-ENC-004 | When an RLE payload is decoded, the engine shall expand runs and reject nonpositive run lengths. | TEST-ENC-004 |
| REQ-ENC-005 | When automatic encoding is requested, the engine shall select the smallest logical slot cost with deterministic dictionary ties. | TEST-ENC-005 |
| REQ-ENC-006 | When encoded size is inspected, the engine shall report dictionary values plus codes or twice the run count. | TEST-ENC-006 |
| REQ-ENC-007 | When a compressed column is sliced, the engine shall return a lossless encoded Python slice. | TEST-ENC-007 |
| REQ-ENC-008 | When dictionary lookup is requested, the engine shall return matching row positions without decoding. | TEST-ENC-008 |
| REQ-ENC-009 | When any scalar is compressed, the engine shall accept only exact None/bool/int/float/str/bytes values and preserve floating signed zero, rejecting all other inputs with ValueError. | TEST-ENC-009 |
## Design
Payloads are tagged immutable tuples: ("dict", dictionary, codes) or ("rle", runs).
All values are hashable scalars; slicing and validation reuse decoder boundaries.
## Assumptions / risks
Python tuple equality supports nulls; spike verifies stable insertion-order dictionaries and run costs.
