# Infrastructure Accomplishment Report — generator

Regenerates `reports/pangasinan-report.html` from the live
**"REGION 1 ARF INFRA MONITORING FORM NO. 1"** Google Sheet — the same report
embedded in the app's **Infra Reports** nav item. Filters to
`Province = Pangasinan` and `Year Funded >= 2024`, and recomputes every
number on the report, including the physical-vs-financial slippage analysis.

## One-time setup (~10 minutes)

You need a Google Cloud **service account** with read access to the sheet.
This is separate from any personal Google login — it's a robot account used
only by this script.

1. **Create a Google Cloud project** (or reuse one): https://console.cloud.google.com/projectcreate
2. **Enable the Google Sheets API** for that project:
   https://console.cloud.google.com/apis/library/sheets.googleapis.com
3. **Create a service account**:
   IAM & Admin → Service Accounts → Create Service Account. Any name is fine
   (e.g. `dar-imis-report-bot`). Skip granting it project roles — it doesn't
   need any.
4. **Create a JSON key** for that service account: open it → Keys → Add Key →
   Create new key → JSON. This downloads a `.json` file.
5. **Save the key** as `scripts/report/credentials.json` in this repo (this
   path is already git-ignored, so it will never be committed).
6. **Share the Google Sheet** with the service account: open the service
   account's details page and copy its email address (looks like
   `dar-imis-report-bot@your-project.iam.gserviceaccount.com`). Then open the
   "REGION 1 ARF INFRA MONITORING FORM NO. 1" sheet in Google Sheets → Share
   → paste that email → give it **Viewer** access.

That's it — steps 1-5 are one-time; step 6 only needs redoing if you rotate
the key or the sheet owner changes.

## Usage

```
npm install        # first time only
npm run report
```

This overwrites `reports/pangasinan-report.html`. Refresh the "Infra
Reports" page in the app (or just re-open it) to see the update — nothing
else needs to change or redeploy.

If you want to commit the refreshed report so it's live on your deployed
site, commit `reports/pangasinan-report.html` as you normally would.

## Configuration

All optional, set as environment variables if your setup differs from the
defaults:

| Variable | Default | Purpose |
|---|---|---|
| `REPORT_SHEET_ID` | the known Pangasinan sheet ID | Google Sheet to read |
| `REPORT_SHEET_RANGE` | `'REG.1'!A1:BK5000` | Range/tab to read. The sheet has two tabs — `GUIDEPOST` (column documentation) and `REG.1` (the actual data) — so this must point at `REG.1` unless DAR renames it, in which case set this to `'NewTabName'!A1:BK5000` (exact tab name shown at the bottom of the Google Sheet). |
| `GOOGLE_APPLICATION_CREDENTIALS` | `scripts/report/credentials.json` | Path to the service-account key file |

## Troubleshooting

- **"Service account credentials not found"** — you haven't done step 5 above.
- **"Could not find the header row"** — the tab name in `REPORT_SHEET_RANGE`
  is wrong (most likely DAR renamed the `REG.1` tab), or the sheet's layout
  changed. Open the sheet, check the tab names at the bottom, and confirm
  column A still starts with `REGION` on the header row of the data tab.
- **A `PERMISSION_DENIED` / 403 error from Google** — the sheet hasn't been
  shared with the service account's email (step 6), or the Sheets API isn't
  enabled on the project (step 2).
- **Numbers look off after a sheet edit** — this script filters strictly to
  `Province = Pangasinan` (exact match, case-sensitive) and `Year Funded`
  parseable as an integer ≥ 2024. A typo in either column on a row will
  silently drop that row from the report.

## What "slippage" means here

`Slippage = Physical Accomplishment % − Financial Accomplishment %`, both as
reported per project in the sheet. It is always ≥ 0 in practice (fund
disbursement doesn't outpace physical work) — a high value means a project
is further along in construction than in billing/payment, i.e. a
disbursement lag worth following up on, not a sign the project itself is
behind schedule.

## Column mapping

The script reads fixed 0-based column positions (see `COL` in
`generate-report.js`) rather than looking up columns by header name, because
the sheet has two columns both literally named "CONTRACT COST" (one under the
documented 59-column form, one under an appended "FINANCIAL STATUS AS PER
FINANCE" block). If DAR Central ever reorders or inserts columns in this
sheet, update the indices in `COL` to match — a quick way to find the new
indices is to open the sheet, count columns from A, and subtract 1.
