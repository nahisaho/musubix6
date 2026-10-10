---
feature: validate
tier: T2
---
# validate
Goal: validate untrusted create-booking JSON.   Non-goals: HTTP transport.   Depends: domain, avail.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-VALIDATE-001 | If the body is not a plain object, then validateCreateRequest shall return ok=false with an error on field "body". | TEST-VALIDATE-001 |
| REQ-VALIDATE-002 | If resource is not a string of 1 to 64 characters, then validateCreateRequest shall report field "resource". | TEST-VALIDATE-002 |
| REQ-VALIDATE-003 | If start or end is not an ISO-8601 timestamp with an explicit offset or Z, then validateCreateRequest shall report that field. | TEST-VALIDATE-003 |
| REQ-VALIDATE-004 | If end is not after start, then validateCreateRequest shall report field "end". | TEST-VALIDATE-004 |
| REQ-VALIDATE-005 | If timeZone is not a valid IANA zone, then validateCreateRequest shall report field "timeZone". | TEST-VALIDATE-005 |
| REQ-VALIDATE-006 | If priceCents is not a non-negative integer or currency is malformed, then validateCreateRequest shall report field "price". | TEST-VALIDATE-006 |
| REQ-VALIDATE-007 | When the body is valid, validateCreateRequest shall return ok=true with an Interval in epoch ms and a Money value; when invalid it shall report all errors, not only the first. | TEST-VALIDATE-007 |

## Design
Components: validate.ts pure function; no throwing for bad input (result union). Trust boundary: body is `unknown`; strict ISO regex requires offset to avoid server-local parsing.
Data flow: unknown -> field checks -> {ok,value}|{ok:false,errors:[{field,message}]}; uses domain money(), avail zonedOffsetMinutes (zone check), interval makeInterval.
Decisions: errors accumulate; unknown extra fields ignored.
## Assumptions / risks
Date.parse accepts non-ISO forms; regex gate retires it (TEST-VALIDATE-003).
