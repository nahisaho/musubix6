---
feature: catalog
tier: T1
approval: auto
---
# catalog
Goal: typed in-memory tables with validated inserts. Non-goals: persistence, indexes, ALTER.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-CAT-001 | When a table is created, the catalog shall store its columns (INT, FLOAT, TEXT, BOOL) and look tables up case-insensitively. | TEST-CAT-001 |
| REQ-CAT-002 | If a table already exists, or a column name repeats (case-insensitive), or a type is unknown, or there are no columns, then create shall raise CatalogError. | TEST-CAT-002 |
| REQ-CAT-003 | When a row is inserted, the catalog shall coerce ints to float for FLOAT columns and store NULL as None. | TEST-CAT-003 |
| REQ-CAT-004 | If a value has the wrong type (bool is not INT), or arity differs, then insert shall raise CatalogError and store nothing. | TEST-CAT-004 |
| REQ-CAT-005 | If a NOT NULL column receives NULL, then insert shall raise CatalogError and store nothing (multi-row insert is atomic). | TEST-CAT-005 |
