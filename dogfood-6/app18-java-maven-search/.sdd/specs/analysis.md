---
feature: analysis
tier: T1
---
# analysis
Goal: text -> positioned, normalized tokens (tokenize, fold, lowercase, stop, Porter step 1a/1b stem).
Non-goals: language detection, Porter steps 2-5.

| ID | EARS requirement | Test |
| --- | --- | --- |
| REQ-ANALYSIS-001 | When text is tokenized, the system shall split on every char that is not a letter, digit or combining mark and number tokens 0,1,2.. in order. | TEST-ANALYSIS-001 |
| REQ-ANALYSIS-002 | If the input is null, then the system shall throw IllegalArgumentException; blank input shall yield no tokens. | TEST-ANALYSIS-002 |
| REQ-ANALYSIS-003 | When a token is longer than 255 chars, the system shall drop it but still consume its position. | TEST-ANALYSIS-003 |
| REQ-ANALYSIS-004 | When lowercasing, the system shall use Locale.ROOT regardless of the default locale. | TEST-ANALYSIS-004 |
| REQ-ANALYSIS-005 | When folding, the system shall apply NFKD and strip combining marks so "Café" and full-width "ｆｕｌｌ" become "cafe" and "full". | TEST-ANALYSIS-005 |
| REQ-ANALYSIS-006 | When stopwords are removed, the system shall keep the position of every remaining token (gaps are preserved). | TEST-ANALYSIS-006 |
| REQ-ANALYSIS-007 | When stemming a word, the system shall apply Porter step 1a (sses->ss, ies->i, ss->ss, s->"" ). | TEST-ANALYSIS-007 |
| REQ-ANALYSIS-008 | When stemming a word, the system shall apply Porter step 1b (eed/ed/ing with measure and vowel conditions, at/bl/iz->+e, double consonant undoubling). | TEST-ANALYSIS-008 |
| REQ-ANALYSIS-009 | When the standard analyzer runs, the system shall apply fold, lowercase, stop (on unstemmed form) then stem, in that order. | TEST-ANALYSIS-009 |
| REQ-ANALYSIS-010 | When a word has two or fewer characters, the system shall leave it unchanged when stemming, so a stem is never empty. | TEST-ANALYSIS-010 |

## Assumptions / risks
- Combining marks in decomposed input must not split a token (TEST-ANALYSIS-001).
- Stop matching uses the unstemmed lowercase form (TEST-ANALYSIS-009).
