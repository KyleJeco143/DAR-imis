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

- **"Total Agri Land" is a 1993–2015 baseline.** Some barangays have since had
  more land distributed than that baseline recorded, which the app clamps at
  100% "distributed" rather than showing an impossible >100% figure — but the
  underlying denominator may just be stale. Verify on site if a % looks off.
- **Adjacent-barangay detection only works where the app has real surveyed
  boundaries** (`rf` in `index.html`, currently ~9 municipalities: Calasiao,
  Alaminos, Tayug, Infanta, Sta. Maria, Mapandan, Bolinao, Sison, Malasique —
  and only some barangays within a few of those). Elsewhere, only an
  approximate municipality outline exists, which isn't precise enough to
  honestly claim two specific barangays share a border — the app says so and
  falls back to manual entry rather than guessing.
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
