#!/usr/bin/env node
// Pulls the "REGION 1 ARF INFRA MONITORING FORM NO. 1" sheet, filters to
// Province = Pangasinan and Year Funded >= 2024, and regenerates
// reports/pangasinan-report.html — the same report the DAR-imis app's
// "Infra Reports" nav item embeds.
//
// One-time setup: see scripts/report/README.md.
// Usage: node scripts/report/generate-report.js
'use strict';

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const SPREADSHEET_ID = process.env.REPORT_SHEET_ID || '1RkSa07tivqCjY5xtJdDiK-adpYEDeFf7GwuMskGG_Oo';
// If your sheet has a specific tab name, set REPORT_SHEET_RANGE to e.g. "'Sheet1'!A1:BK5000".
const SHEET_RANGE = process.env.REPORT_SHEET_RANGE || 'A1:BK5000';
const CREDENTIALS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, 'credentials.json');

const TEMPLATE_DIR = path.join(__dirname, 'template');
const OUT_DIR = path.join(__dirname, '..', '..', 'reports');
const OUT_FILE = path.join(OUT_DIR, 'pangasinan-report.html');

// 0-based column indices in the sheet — see README.md for the full column map.
const COL = {
  PROVINCE: 1,
  MUNI: 4,
  BRGY: 5,
  PTYPE: 10,
  NAME: 11,
  COST_SARO: 15,
  YEAR: 21,
  COMPLETION_DATE: 24,
  PHYS_PCT: 37,
  PHYS_STATUS: 38,
  AMOUNT_OBLIGATED: 41,
  AMOUNT_DISBURSED: 44,
  FIN_PCT: 56,
  CONTRACT_COST: 59,
  PAYMENT_MADE: 60,
  UNPAID: 61,
  FIN_STATUS: 62,
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---------------- parsing helpers ----------------

function parseMoney(s) {
  if (s == null) return null;
  const t = String(s).replace(/[₱,\s]/g, '').trim();
  if (t === '' || t === '-' || t === '—') return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}
function parsePct(s) {
  if (s == null) return null;
  const t = String(s).replace(/%/g, '').trim();
  if (t === '' || t === '-' || t === '—') return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}
function parseYear(s) {
  const n = parseInt(String(s || '').trim(), 10);
  return Number.isFinite(n) ? n : null;
}
function parseDate(s) {
  if (!s) return null;
  const d = new Date(String(s).trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

// ---------------- fetch + parse ----------------

async function fetchRawRows() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Service account credentials not found at ${CREDENTIALS_PATH}.\n` +
      'Run the one-time setup in scripts/report/README.md first.'
    );
  }
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_RANGE,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  return res.data.values || [];
}

function buildRows(raw) {
  const headerIdx = raw.findIndex((r) => (r[0] || '').trim().toUpperCase() === 'REGION');
  if (headerIdx === -1) {
    throw new Error('Could not find the header row (column A = "REGION"). Check REPORT_SHEET_RANGE / the sheet tab name.');
  }
  const rows = [];
  for (const r of raw.slice(headerIdx + 1)) {
    const province = (r[COL.PROVINCE] || '').trim();
    if (province !== 'Pangasinan') continue;
    const year = parseYear(r[COL.YEAR]);
    if (year == null || year < 2024) continue;
    const muni = (r[COL.MUNI] || '').trim();
    const name = (r[COL.NAME] || '').trim();
    if (!muni || !name) continue;

    const cost_saro = parseMoney(r[COL.COST_SARO]);
    const phys_pct = parsePct(r[COL.PHYS_PCT]);
    const phys_status_raw = (r[COL.PHYS_STATUS] || '').trim();
    const fin_pct = parsePct(r[COL.FIN_PCT]);

    rows.push({
      muni,
      brgy: (r[COL.BRGY] || '').trim(),
      ptype: (r[COL.PTYPE] || '').trim(),
      name,
      cost_saro,
      year,
      completion_date: parseDate(r[COL.COMPLETION_DATE]),
      phys_pct,
      phys_status: phys_status_raw || null,
      phys_bucket: bucketPhys(phys_status_raw),
      amount_obligated: cappedMoney(parseMoney(r[COL.AMOUNT_OBLIGATED]), cost_saro),
      amount_disbursed: cappedMoney(parseMoney(r[COL.AMOUNT_DISBURSED]), cost_saro),
      fin_pct,
      fin_status: (r[COL.FIN_STATUS] || '').trim() || null,
      slippage: phys_pct != null && fin_pct != null ? round1(phys_pct - fin_pct) : null,
    });
  }
  return rows;
}

// Government sheets occasionally have a stray obligated/disbursed figure that's
// wildly larger than the approved budget (data-entry typo). Excluding those from
// the financial roll-up avoids one bad row skewing the province-wide total.
function cappedMoney(v, budget) {
  if (v == null) return null;
  if (budget != null && v > budget * 1.5) return null;
  return v;
}
function bucketPhys(status) {
  const s = (status || '').toLowerCase();
  if (s === 'completed') return 'completed';
  if (s.startsWith('on-going')) return 'ongoing';
  return 'other';
}
function round1(n) { return Math.round(n * 10) / 10; }

// ---------------- aggregation ----------------

function computeSummary(rows) {
  const total = rows.length;
  const completed = rows.filter((r) => r.phys_bucket === 'completed').length;
  const ongoing = rows.filter((r) => r.phys_bucket === 'ongoing').length;
  const other = total - completed - ongoing;
  const total_saro = rows.reduce((s, r) => s + (r.cost_saro || 0), 0);

  const obligated = rows.filter((r) => r.amount_obligated != null);
  const disbursed = rows.filter((r) => r.amount_disbursed != null);
  const total_obligated = obligated.reduce((s, r) => s + r.amount_obligated, 0);
  const total_disbursed = disbursed.reduce((s, r) => s + r.amount_disbursed, 0);

  const years = rows.map((r) => r.year).filter((y) => y != null);
  const minYear = years.length ? Math.min(...years) : new Date().getFullYear();
  const now = new Date();

  return {
    total, completed, ongoing, other,
    completed_pct: round1((completed / total) * 100),
    ongoing_pct: round1((ongoing / total) * 100),
    other_pct: round1((other / total) * 100),
    total_saro,
    total_obligated, n_obligated: obligated.length,
    total_disbursed, n_disbursed: disbursed.length,
    pct_disbursed: total_obligated > 0 ? round1((total_disbursed / total_obligated) * 100) : 0,
    period: `CY ${minYear}–${Math.max(now.getFullYear(), ...years)}`,
    as_of: `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`,
  };
}

function computeMuniStatus(rows) {
  const byMuni = new Map();
  for (const r of rows) {
    if (!byMuni.has(r.muni)) byMuni.set(r.muni, { muni: r.muni, total: 0, completed: 0, ongoing: 0, other: 0 });
    const m = byMuni.get(r.muni);
    m.total += 1;
    m[r.phys_bucket] += 1;
  }
  return [...byMuni.values()].sort((a, b) => b.total - a.total);
}

function computeTrend(rows) {
  const withDate = rows.filter((r) => r.completion_date != null).sort((a, b) => a.completion_date - b.completion_date);
  if (!withDate.length) return [];
  const total = rows.length;
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const months = [...new Set(withDate.map((r) => monthKey(r.completion_date)))];

  let points = months.map((mk, i) => {
    const cumCount = withDate.filter((r) => monthKey(r.completion_date) <= mk).length;
    return { label: mk, pct: round1((cumCount / total) * 100) };
  });
  if (points.length > 7) {
    const head = points.slice(0, 6);
    const last = points[points.length - 1];
    points = [...head, { label: 'Later', pct: last.pct }];
  }
  return points;
}

function computeSlippage(rows) {
  const byMuni = new Map();
  for (const r of rows) {
    if (!byMuni.has(r.muni)) byMuni.set(r.muni, []);
    byMuni.get(r.muni).push(r);
  }
  const muni_slippage = [...byMuni.entries()].map(([muni, list]) => {
    const paired = list.filter((r) => r.phys_pct != null && r.fin_pct != null);
    let avg_phys = null, avg_fin = null, avg_slippage = null;
    if (paired.length) {
      avg_phys = round1(paired.reduce((s, r) => s + r.phys_pct, 0) / paired.length);
      avg_fin = round1(paired.reduce((s, r) => s + r.fin_pct, 0) / paired.length);
      avg_slippage = round1(avg_phys - avg_fin);
    }
    return { muni, avg_phys, avg_fin, avg_slippage, count: list.length };
  }).sort((a, b) => (b.avg_slippage ?? -1) - (a.avg_slippage ?? -1));

  const withSlip = rows.filter((r) => r.slippage != null);
  const province_avg_slippage = withSlip.length
    ? round1(withSlip.reduce((s, r) => s + r.slippage, 0) / withSlip.length)
    : 0;

  const top_flagged = withSlip
    .slice()
    .sort((a, b) => b.slippage - a.slippage)
    .slice(0, 6)
    .map((r) => ({ muni: r.muni, brgy: r.brgy, name: r.name, phys_pct: r.phys_pct, fin_pct: r.fin_pct, slippage: r.slippage }));

  return { province_avg_slippage, muni_slippage, top_flagged };
}

// ---------------- render ----------------

function render(rows) {
  const summary = computeSummary(rows);
  const muni_status = computeMuniStatus(rows);
  const trend = computeTrend(rows);
  const slippage = computeSlippage(rows);
  const data = { summary, muni_status, trend, slippage };

  const html = fs.readFileSync(path.join(TEMPLATE_DIR, 'poster.html'), 'utf8');
  const css = fs.readFileSync(path.join(TEMPLATE_DIR, 'poster.css'), 'utf8');
  const js = fs.readFileSync(path.join(TEMPLATE_DIR, 'poster.js'), 'utf8');
  const fontsCss = fs.readFileSync(path.join(TEMPLATE_DIR, 'fonts.css'), 'utf8');

  const out = html
    .replace('__FONTS_CSS__', fontsCss)
    .replace('__POSTER_CSS__', css)
    .replace('__POSTER_DATA__', JSON.stringify(data))
    .replace('__POSTER_JS__', js);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, out, 'utf8');
  return { data, outFile: OUT_FILE };
}

// ---------------- main ----------------

async function main() {
  console.log('Fetching sheet data...');
  const raw = await fetchRawRows();
  console.log(`  ${raw.length} raw rows fetched`);

  const rows = buildRows(raw);
  console.log(`  ${rows.length} Pangasinan projects (CY 2024+) after filtering`);
  if (!rows.length) {
    throw new Error('No matching rows found — check that the sheet still has Province="Pangasinan" and Year Funded>=2024 rows in the expected columns.');
  }

  const { data, outFile } = render(rows);
  console.log(`Report written to ${outFile}`);
  console.log(`  ${data.summary.total} projects, ${data.summary.completed_pct}% completed, avg slippage ${data.slippage.province_avg_slippage} pts`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
  });
}

module.exports = { buildRows, computeSummary, computeMuniStatus, computeTrend, computeSlippage, render };
