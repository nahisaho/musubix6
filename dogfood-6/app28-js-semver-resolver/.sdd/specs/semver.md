---
feature: semver
tier: T1
---
# semver
Goal: strict SemVer 2.0.0 parsing, precedence and formatting. Non-goals: loose parsing, coercion.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-SEMV-001 | When parse(s) receives a valid `M.m.p[-pre][+build]` string, the system shall return {major,minor,patch,prerelease[],build[]} with numeric fields as numbers. | TEST-SEMV-001 |
| REQ-SEMV-002 | If the string has leading zeros, negative or missing parts, empty identifiers or non-string input, then parse shall throw SemverError. | TEST-SEMV-002 |
| REQ-SEMV-003 | When comparing versions, the system shall ignore build metadata. | TEST-SEMV-003 |
| REQ-SEMV-004 | While comparing prerelease identifiers, numeric ones shall compare numerically, alphanumeric ones lexically, and numeric shall rank below alphanumeric. | TEST-SEMV-004 |
| REQ-SEMV-005 | While comparing prerelease sets of unequal length with equal prefix, the shorter set shall rank lower. | TEST-SEMV-005 |
| REQ-SEMV-006 | A version without prerelease shall rank above the same M.m.p with prerelease. | TEST-SEMV-006 |
| REQ-SEMV-007 | The compare function shall be antisymmetric and transitive over any sample of versions. | TEST-SEMV-007 |
| REQ-SEMV-008 | When format(parse(s)) is evaluated for a valid s, the system shall return s unchanged. | TEST-SEMV-008 |
| REQ-SEMV-009 | When inc(v, kind) is called, the system shall bump major/minor/patch resetting lower parts and drop prerelease/build. | TEST-SEMV-009 |
| REQ-SEMV-010 | When sortVersions(list) is called, the system shall return a new ascending list without mutating the input. | TEST-SEMV-010 |
