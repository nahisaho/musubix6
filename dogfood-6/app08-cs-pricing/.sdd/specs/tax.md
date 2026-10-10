---
feature: tax
tier: T2
---
# tax
Goal: per-jurisdiction tax with category exemptions and rounding scope. Non-goals: tax filing, compound taxes.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-TAX-001 | When tax is calculated for a known jurisdiction, the system shall apply that jurisdiction's rate to the taxable net amounts. | TEST-TAX-001 |
| REQ-TAX-002 | If the jurisdiction is not in the tax table, then the system shall throw UnknownJurisdictionException. | TEST-TAX-002 |
| REQ-TAX-003 | While a line's category is exempt in the jurisdiction, the system shall charge zero tax on that line. | TEST-TAX-003 |
| REQ-TAX-004 | Where rounding scope is PerLine, the system shall round each line's tax before summing; where PerOrder, the system shall sum unrounded then round once. | TEST-TAX-004 |
| REQ-TAX-005 | If a rate is outside 0..1, then the system shall throw ArgumentOutOfRangeException when building the table. | TEST-TAX-005 |
| REQ-TAX-006 | Where prices are tax-inclusive, the system shall extract tax as gross - gross/(1+rate) and report net amounts. | TEST-TAX-006 |

## Design
Components: TaxTable(jurisdiction -> JurisdictionRule(rate, exemptCategories)), TaxCalculator(table, RoundingMode, TaxScope, inclusive), TaxableLine(category, amount), TaxResult(Tax, Net, Gross).
Flow: look up rule (throw if absent) -> per line tax (0 if exempt) -> PerLine: Round each line / PerOrder: sum then Round -> result. Inclusive: tax = gross - gross/(1+rate).
Depends on money (Round REQ-MONEY-003/004, addition REQ-MONEY-001); independent of discounts.
## Assumptions / risks: single-rate jurisdictions only -- compound tax is a non-goal.
