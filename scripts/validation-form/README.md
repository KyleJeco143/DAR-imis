# Validation Form — data pipeline

Builds `data/arb-barangay-stats.json`, the per-barangay dataset the app's
**Validation Form** page (Infrastructure Project Validation Form No. 1) fetches
at runtime to auto-fill CARP area, ARB counts, ARC info, and population.

## Sources

Three spreadsheets, supplied out-of-band and **never committed to this repo**
(the ARB list contains beneficiary names/IDs — PII; the others are large and
derived data is all that's needed):

| Source | What it provides |
|---|---|
| Unprotected Pangasinan ARB list (`ListOfARBs_ao_2020` sheet) | Per-lot beneficiary records → aggregated to distributed CARP area (ha) and distinct ARB count, per barangay |
| `VF_FORMS_IN_DAR` workbook (`Bgys` sheet) | Per-barangay ARC membership, ARB household count, and "Total Agri Land" (ha) — a 1993–2015 ARC-formation baseline |
| PSA 2024 Census, "Population by Province, City, Municipality, and Barangay" (Region I workbook, `Pangasinan` sheet) | Per-barangay population, as of 01 July 2024 |

## Usage

```
ARB_LIST_XLSX=/path/to/UNPROTECTEDPangasinanARBList.xlsx \
VF_FORMS_XLSX=/path/to/VF_FORMS_IN_DAR.xlsx \
POPULATION_XLSX=/path/to/Region_I_Population2024.xlsx \
node scripts/validation-form/build-arb-stats.js
```

`POPULATION_XLSX` is optional — omit it to rebuild without population figures
(the app just shows "no data" for population in that case). Output is a flat
JSON array at `data/arb-barangay-stats.json`; the script logs a coverage
summary (how many barangays came from each source, how many matched) so you
can sanity-check a rebuild.

Municipality names are spelled inconsistently across the three sources (e.g.
`CITY OF ALAMINOS` / `ALAMINOS CITY` / `Alaminos`, `Sta. Maria` / `Malasique`);
the script normalizes these to join the datasets, and picks one consistent
display spelling per municipality (always including "City" if any source row
used it) so the same place never splits into two dropdown entries. Check the
coverage summary after any rebuild — a big drop usually means a source added
a new spelling variant that needs adding to `MUNI_FIXES`.

Barangay names have the same problem one level down — typos, transposed
letters, hyphens vs spaces, "Sta."/"Sto." abbreviated in one source and
spelled out in another, stray periods, and genuine same-place respellings
(e.g. Umingan's "Don Abalos" vs "Don Justo Abalos"). The script strips
diacritics/periods and expands "Sta."/"Sto." automatically, then routes
through a curated `KNOWN_BARANGAY_ALIASES` table for the rest — found by
cross-checking every barangay that failed to match the PSA population list
against that municipality's real barangay list. Directional/numbered splits
that are genuinely different places (e.g. "Carmay East" vs "Carmay West",
"San Aurelio 1st/2nd/3rd") are deliberately left alone even when they look
similar. Barangay rows literally named "NULL" (a handful in the ARB list,
in San Jacinto/Bayambang/Sual) are dropped rather than shown as a fake
barangay. If a rebuild's population match rate drops, check for a new
unmatched spelling that belongs in `KNOWN_BARANGAY_ALIASES`.

## Boundary data

Builds `data/barangay-boundaries.json`, the barangay polygon dataset used by
the Validation Form's adjacent-barangay detection (`VF_findAdjacent` in
`index.html`). Unlike the sources above, this one has no PII and is safe to
regenerate from public data — the source files themselves aren't committed
though, just the compact merged output.

Source: barangay/sub-municipality-level GeoJSON from
[faeldon/philippines-json-maps](https://github.com/faeldon/philippines-json-maps)
(MIT licensed), which republishes PSA PSGC-derived boundaries. You need two
files from that repo's `2023/geojson/` tree:

| File | What it provides |
|---|---|
| `provdists/lowres/municities-provdist-105500000.0.001.json` | Pangasinan's 48 municipalities/cities, with PSGC codes (`105500000` is Pangasinan's `adm2_psgc`) |
| `municities/hires/bgysubmuns-municity-<adm3_psgc>.0.1.json` | One file per municipality, all its barangay/sub-municipality polygons |

```
PROVDIST_JSON=/path/to/municities-provdist-105500000.0.001.json \
MUNICITY_BGY_DIR=/path/to/municities/hires \
node scripts/validation-form/build-barangay-boundaries.js
```

Output is a flat JSON array of `{ municipality, barangay, rings }`, one entry
per barangay (`rings` is an array of coordinate rings — more than one for
MultiPolygon barangays), coordinates rounded to ~1m precision. Municipality
names are normalized to match the display spelling used in
`arb-barangay-stats.json` (e.g. "CITY OF ALAMINOS" → "ALAMINOS CITY");
barangay names are normalized but not alias-mapped, so a name that doesn't
match a stats record just means that neighbor won't be enriched with
area/ARB/population figures — see the coverage caveat under "Known
limitations" below.

## Saving records (Supabase setup)

The Validation Form page can save filled-in forms — barangay, project info,
and all the manual scoring sections — to a `validation_forms` table, synced
live the same way every other record type in this app is (Projects,
Documents, SME records, etc). The table doesn't exist by default; create it
once in your Supabase project's **SQL Editor**:

```sql
create table public.validation_forms (
  id text primary key,
  municipality text not null,
  barangay text not null,
  project_name text,
  project_type text,
  physical_target text,
  project_cost numeric,
  implementing_agency text,
  actual_arb numeric default 0,
  potential_arb numeric default 0,
  non_arb numeric default 0,
  manual_adj_arb numeric default 0,
  manual_adj_pop numeric default 0,
  org jsonb,
  imp jsonb,
  safe jsonb,
  has_road_map boolean default false,
  justification text,
  validated_by text,
  noted_by text,
  noted_by_parpo text,
  noted_by_regional text,
  total_score numeric,
  updated_at timestamptz default now()
);

alter table public.validation_forms enable row level security;

create policy "Authenticated users can read/write validation forms"
  on public.validation_forms for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table public.validation_forms;
```

Match this to whatever RLS convention the rest of your tables already use if
it differs from "any authenticated user can read/write everything" — this app
doesn't scope records per-user, so that's the same access level `projects`,
`documents`, etc. already have.

**If you already created the table before `justification`/`validated_by`/
`noted_by` existed**, add them with:

```sql
alter table public.validation_forms
  add column if not exists justification text,
  add column if not exists validated_by text,
  add column if not exists noted_by text;
```

**If you already created the table before the Noted By block had all three
signatories** (it originally had just one `noted_by` field; the export now
shows OIC-CARPO, PARPO I, and PARPO II as separate blank/editable lines
matching the official form), add the other two with:

```sql
alter table public.validation_forms
  add column if not exists noted_by_parpo text,
  add column if not exists noted_by_regional text;
```

Only the barangay/municipality selection and manually-entered fields are
stored — the auto-computed CARP/ARB/population figures are recalculated live
from `arb-barangay-stats.json` on load, so they never go stale relative to
the underlying dataset. `total_score` is stored as a point-in-time snapshot
for the saved-forms list, not a live value.

## Known limitations

- **"Total Agri Land" is a 1993–2015 baseline.** The Validation Form's B
  section computes CARP Area as the selected barangay's distributed area plus
  its adjacent barangays', and Non-CARP Area as that same barangay + adjacent
  set's summed Total Agri Land minus that CARP area — clamped so the %
  distributed never exceeds 100 (some barangays have since had more land
  distributed than the baseline recorded). The underlying denominator may
  just be stale; verify on site if a % looks off.
- **Adjacent-barangay detection now uses real surveyed boundaries for the
  whole province** (`data/barangay-boundaries.json`, built by
  `build-barangay-boundaries.js` below — 1,364 barangay/sub-municipality
  polygons across all 48 Pangasinan municipalities/cities, sourced from PSA
  PSGC-derived GeoJSON). Two barangays count as adjacent when their polygons'
  closest points are within the app's proximity threshold. About 94.5% of
  `arb-barangay-stats.json` records have a matching polygon (by normalized
  name) and so get a real surveyed-boundary match; the rest fall back to the
  old same-ARC-cluster heuristic. Of the polygons themselves, about 76% have
  a matching stats record — a found neighbor without one just doesn't
  contribute area/ARB/population figures, the same graceful degradation as
  before. (This replaces the old `rf` object in `index.html`, which only
  covered ~9 municipalities and is still used as-is by the separate ARC Map
  feature.)
- **Population match rate is ~95%** against the ARB/ARC barangay set after
  the alias cleanup above. The remainder is mostly barangays that appear to
  be filed under the wrong municipality in the source data (e.g. a handful
  of Aguilar/Mangatarem barangays showing up under Bani, and a Santa Maria
  barangay under Tayug) — the script doesn't attempt to correct those, since
  reassigning a beneficiary's municipality without stronger confirmation
  risks being wrong in a more consequential way than just leaving the
  population figure blank.
- Sections C (Farmers Organization), D (Importance/Necessity), and E
  (Safeguards) of the validation form are inherently judgment calls from an
  actual site visit — nothing in these spreadsheets can answer them, so
  they're manual inputs in the app.
