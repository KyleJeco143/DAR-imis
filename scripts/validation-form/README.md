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
the script normalizes these to join the datasets. Check the coverage summary
after any rebuild — a big drop usually means a source added a new spelling
variant that needs adding to `MUNI_FIXES`.

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
- **Population match rate is ~85%** against the ARB/ARC barangay set, mostly
  due to spelling variants the normalizer doesn't catch yet.
- Sections C (Farmers Organization), D (Importance/Necessity), and E
  (Safeguards) of the validation form are inherently judgment calls from an
  actual site visit — nothing in these spreadsheets can answer them, so
  they're manual inputs in the app.
