# PANGASINAN INFRASTRUCTURE PROJECTS 2022–2025

Reference doc for Claude (and future contributors) on the Pangasinan subset of DAR Region I's
**Agrarian Reform Fund (ARF) Infrastructure (FMR & Irrigation) Monitoring Form** — the source
workbook DAR Regional Office I uses to track FMR, Irrigation, Bridge, and Box Culvert
sub-projects funded under ARF. This doc covers **Pangasinan rows only**. This is a *separate,
higher-level* dataset from Kyle's DAR-imis Pangasinan system, but shares the same subject
matter (FMR/Irrigation monitoring) and may be a future data-integration source.

## File

- Source: `REGION_1_ARF_INFRA_MONITORING_FORM_NO__1.xlsx`
- As of: **March 2026**
- Two sheets:
  - `GUIDEPOST` — column dictionary (definitions for all 59 columns)
  - `REG.1` — actual data rows (header starts at row 7 in Excel / index 6 with 0-based pandas header); filtered here to `PROVINCE == "Pangasinan"`

## Pangasinan dataset snapshot

- **176 sub-project rows**
- **Project types:** FMR (168), Irrigation (5), Bridge (2), Box Culvert (1)
- **Physical status:** Completed (165), On-going (11)
- **Year funded:** 2022 (77), 2023 (2), 2024 (92), 2025 (5)
- **Total Project Cost per SARO:** ≈ **PHP 1,964,900,000**
- **Total FMR length:** ≈ **71.5 km** (sum of SCOPE for FMR rows)
- **Municipalities/cities covered (34):** Agno, Aguilar, Alaminos City, Anda, Asingan, Balungao,
  Bani, Bayambang, Binalonan, Bolinao, Bugallon, Burgos, Calasiao, Dasol, Infanta, Labrador,
  Laoac, Mabini, Malasiqui, Mangantarem, Mangatarem, Mapandan, Natividad, Pozorrubio, Rosales,
  San Carlos City, San Manuel, San Nicolas, San Quintin, Sison, Sta. Maria, Tayug, Umingan,
  Urdaneta City
- **Congressional districts:** 6th (105 rows — heaviest, via Rep. Primicias-Agabas), 3rd (25),
  1st (15), 2nd (15), 5th (15)
- **Implementing units:** DPWH (106), MLGU (45), LGU (20), NIA / NIA-RO I (5)
- **Financial status:** Not Fully Paid (81), Fully Paid (42–43, casing inconsistent), blank (52)

## Column schema (from GUIDEPOST sheet)

The form has **59 numbered columns** (col 49–56 covers 4 payment tranches × amount+date pairs,
counted as one range). Full definitions:

| # | Column | Description |
|---|--------|-------------|
| 1 | REGION | Region of the sub-project (CAR, I, II, III, CALABARZON, MIMAROPA, V, VI, VII, NIR, VIII, IX, X, XI, XII, CARAGA) |
| 2 | PROVINCE | Province |
| 3 | CONGRESSIONAL DISTRICT | Lone/1st–8th |
| 4 | REPRESENTATIVE | Congressional Representative name |
| 5 | MUNICIPALITY / CITY | Location |
| 6 | BARANGAY/S COVERED | Barangay(s) |
| 7 | NAME OF ARC / SARC | ARC or SARC name |
| 8 | ARC CLUSTER NAME | ARCC name |
| 9 | MAJOR CROP/S PLANTED | Crops in area served |
| 10 | NAME OF PROPONENT ARBO OR ARBO BENEFITTED | Requesting/benefiting ARBO |
| 11 | PROJECT TYPE | FMR / Irrigation Project / Bridge (also seen: SPIS, Box Culvert) |
| 12 | SUB-PROJECT NAME | Full project name incl. barangay(s) |
| 13 | SCOPE | Number/size/length (e.g. 0.639) |
| 14 | UNIT OF MEASURE | Kms. (FMR), Has. (Irrigation/hectarage), Lms. (Bridge, linear meters) |
| 15 | INCLUDED IN ARC DEVELOPMENT PLAN? | YES/NO |
| 16 | PROJECT COST PER SARO (PHP) | Approved cost per SARO |
| 17 | SARO NUMBER | e.g. BMB-E-24-0016720 |
| 18 | DATE OF SARO RELEASED | |
| 19 | MODE OF IMPLEMENTATION | By Contract / By Administration |
| 20 | IMPLEMENTING UNIT | DPWH, LGU (PLGU/MLGU), NIA (NIA CARP-IC/Region/Province) |
| 21 | NAME OF CONTRACTOR | |
| 22 | YEAR FUNDED | |
| 23 | START DATE | Date of Notice to Proceed |
| 24 | CONTRACT DURATION | Days incl. variation-order extensions |
| 25 | COMPLETION DATE | Actual completion |
| 26 | DATE OF TURN-OVER | |
| 27 | NUMBER OF BARANGAYS SERVED | |
| 28 | TOTAL ARB BENEF. | |
| 29 | MALE ARB BENEF. | |
| 30 | FEMALE ARB BENEF. | |
| 31 | TOTAL NON-ARB BENEF. | |
| 32 | MALE NON-ARB BENEF. | |
| 33 | FEMALE NON-ARB BENEF. | |
| 34 | JOBS GENERATED (SKILLED MALE) | |
| 35 | JOBS GENERATED (SKILLED FEMALE) | |
| 36 | JOBS GENERATED (UNSKILLED MALE) | |
| 37 | JOBS GENERATED (UNSKILLED FEMALE) | |
| 38 | % ACCOMPLISHED (PHYSICAL) | |
| 39 | PHYSICAL STATUS | On-going (On-Schedule) / On-going (Delayed) / Suspended / Terminated / Completed — reasons go in Remarks |
| 40 | GEO-TAGGED LINK | Shareable Google Drive link (kmz/kml + before/during/after photos) |
| 41 | DATE OF VALIDATION | Initial info-gathering date, pre-construction |
| 42 | AMOUNT OBLIGATED (PHP) | |
| 43 | DATE OF OBLIGATION | |
| 44 | CASH RELEASED (PHP) | |
| 45 | AMOUNT DISBURSED (PHP) | |
| 46 | ABC / BIDDED AMOUNT (PHP) | |
| 47 | CONTRACT COST (PHP) | Winning bid amount |
| 48 | TOTAL AMOUNT (PHP) | Actual total utilized |
| 49–56 | PAYMENT AMOUNT (PHP) × 4 tranches, each with DATE OF PAYMENT | Per-tranche disbursement |
| 57 | % ACCOMPLISHED (FINANCIAL) | |
| 58 | VARIATION ORDER / CHANGE ORDER (PHP) | Capped at 10% of original contract |
| 59 | REMARKS | Anything not captured elsewhere |

Additional columns present in `REG.1` but not in the GUIDEPOST dictionary (finance-team addenda):
`CONTRACT COST` (duplicate/reconciliation column), `PAYMENT MADE`, `UNPAID`, `FINANCIAL STATUS`
(Fully Paid / Not Fully Paid) — grouped under a merged header "FINANCIAL STATUS AS PER FINANCE."

## Known data-quality notes

- Header row in `REG.1` is row **7** in Excel (pandas `header=6`); rows above are titles
  ("INFRASTRUCTURE (FMR & IRRIGATION) MONITORING FORM", "As of March 2026") and numbered
  column markers.
- Some numeric-looking cells contain stray text, e.g. a cost cell with a comma-as-decimal
  typo (`2.458,107.68`), dashes (`-`) meaning "no variation" or zero, and `"Pad"` typo for `"Paid"`.
  Any ETL/import script should coerce numerics defensively (`pd.to_numeric(..., errors="coerce")`).
  Date columns mix `datetime`, plain strings, and `dd/mm/yyyy` text (e.g. `26/01/2025`).
- FINANCIAL STATUS has inconsistent casing (`Fully Paid` vs `Fully paid`).
- Some ARC Cluster names are inconsistently spelled/cased across rows for the same cluster
  (e.g. "EPARCC" vs "LARBARCC") — same normalization problem as DAR-imis's own
  barangay/municipality name mismatches (see main project memory).

## Relationship to DAR-imis (Pangasinan system)

- The **176 Pangasinan rows within this Region I workbook** are a plausible external
  cross-check / bulk-import source for DAR-imis's FMR & Irrigation tables, since both track
  essentially the same 59-column schema (SARO, cost, physical/financial % accomplished,
  beneficiary counts, geo-tagged links).
- If Kyle wants to import this into Supabase, the safe pattern from the main project applies:
  clean/transform in a script (matching `barangay_names`/municipality spelling dictionaries),
  then CSV-import (not SQL paste, which truncates ~20,000 chars) into the relevant table.
