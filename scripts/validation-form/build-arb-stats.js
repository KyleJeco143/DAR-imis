#!/usr/bin/env node
// Aggregates the province-wide ARB (Agrarian Reform Beneficiary) lot list and
// the ARC/barangay reference table into a small per-barangay JSON the app can
// fetch at runtime for the Validation Form feature.
//
// Inputs are NOT committed to the repo (they contain beneficiary names/IDs —
// PII). Point this script at your own copies via the two env vars below; the
// output (data/arb-barangay-stats.json) only ever contains aggregated counts
// and areas, never individual beneficiary records.
//
// Usage:
//   ARB_LIST_XLSX=/path/to/UNPROTECTEDPangasinanARBList.xlsx \
//   VF_FORMS_XLSX=/path/to/VF_FORMS_IN_DAR.xlsx \
//   node scripts/validation-form/build-arb-stats.js
'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ARB_LIST_XLSX = process.env.ARB_LIST_XLSX;
const VF_FORMS_XLSX = process.env.VF_FORMS_XLSX;
const POPULATION_XLSX = process.env.POPULATION_XLSX;
const OUT_FILE = path.join(__dirname, '..', '..', 'data', 'arb-barangay-stats.json');

if (!ARB_LIST_XLSX || !VF_FORMS_XLSX) {
  console.error('Set ARB_LIST_XLSX and VF_FORMS_XLSX env vars to the source spreadsheet paths (POPULATION_XLSX is optional).');
  process.exit(1);
}

// Municipality names are spelled inconsistently across sources ("CITY OF
// ALAMINOS" vs "ALAMINOS CITY" vs "Alaminos", "Sta. Maria" vs "SANTA MARIA",
// "Malasique" vs "MALASIQUI", "Pozzurobio" vs "POZORRUBIO"). Normalize to a
// join key; barangay names are normalized more lightly (case/whitespace only).
const MUNI_FIXES = { POZZUROBIO: 'POZORRUBIO', MALASIQUE: 'MALASIQUI' };
function normMuni(s) {
  let m = String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
  m = m.replace(/^CITY OF /, '').replace(/ CITY$/, '');
  m = m.replace(/^STA\.?\s/, 'SANTA ').replace(/^STO\.?\s/, 'SANTO ');
  return MUNI_FIXES[m] || m;
}
function normBrgy(s) {
  return String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
}
function key(muni, brgy) {
  return `${normMuni(muni)}|${normBrgy(brgy)}`;
}

// Some sheets have a blank first row before the real header; scan for it.
function findHeaderRow(rows, mustInclude) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    if (rows[i] && rows[i].includes(mustInclude)) return i;
  }
  throw new Error(`Could not find a header row containing "${mustInclude}"`);
}

// ---------------- ARB list: per-barangay distributed area + ARB count ----------------

function loadArbStats(file) {
  const wb = XLSX.readFile(file, { sheets: ['ListOfARBs_ao_2020'] });
  const ws = wb.Sheets['ListOfARBs_ao_2020'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const headerIdx = findHeaderRow(rows, 'ARB ID NO.');
  const header = rows[headerIdx];
  const col = (name) => header.indexOf(name);
  const cARB = col('ARB ID NO.'), cMuni = col('MUNICIPALITY'), cBrgy = col('BARANGAY'), cArea = col('AREA (Sq. M.)');

  const byBrgy = new Map();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[cBrgy]) continue;
    const muni = r[cMuni], brgy = r[cBrgy];
    const k = key(muni, brgy);
    let e = byBrgy.get(k);
    if (!e) {
      e = { municipality: String(muni || '').trim(), barangay: String(brgy || '').trim(), arbIds: new Set(), distributedAreaSqm: 0 };
      byBrgy.set(k, e);
    }
    if (r[cARB] != null) e.arbIds.add(String(r[cARB]).trim());
    const area = Number(r[cArea]);
    if (Number.isFinite(area)) e.distributedAreaSqm += area;
  }

  const out = new Map();
  for (const [k, e] of byBrgy) {
    out.set(k, {
      municipality: e.municipality,
      barangay: e.barangay,
      arbCount: e.arbIds.size,
      distributedAreaHa: Math.round((e.distributedAreaSqm / 10000) * 1000) / 1000,
    });
  }
  return out;
}

// ---------------- Bgys: per-barangay ARC + total agri land ----------------

function loadBgysStats(file) {
  const wb = XLSX.readFile(file, { sheets: ['Bgys'] });
  const ws = wb.Sheets['Bgys'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
  const headerIdx = findHeaderRow(rows, 'ARC_ID');
  const header = rows[headerIdx];
  const col = (name) => header.indexOf(name);
  const cArcId = col('ARC_ID'), cArcName = col('ARC_NAME'), cMuni = col('MUNICIPALITY'), cBrgy = col('BARANGAY'),
    cHousehold = col('ARB Household'), cAgriLand = col('Total Agri Land'), cType = col('ARC_Type'), cClass = col('ARC_Classification');

  const out = new Map();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r[cBrgy] || !r[cMuni]) continue;
    const k = key(r[cMuni], r[cBrgy]);
    // A barangay can belong to more than one ARC record across years; keep the one with the largest total agri land figure.
    const agriLand = Number(r[cAgriLand]) || 0;
    const existing = out.get(k);
    if (existing && existing.totalAgriLandHa >= agriLand) continue;
    out.set(k, {
      arcId: r[cArcId] != null ? String(r[cArcId]).trim() : null,
      arcName: r[cArcName] != null ? String(r[cArcName]).trim() : null,
      arcType: r[cType] != null ? String(r[cType]).trim() : null,
      arcClassification: r[cClass] != null ? String(r[cClass]).trim() : null,
      arbHousehold: Number.isFinite(Number(r[cHousehold])) ? Number(r[cHousehold]) : null,
      totalAgriLandHa: Math.round(agriLand * 1000) / 1000,
    });
  }
  return out;
}

// ---------------- Population: PSA 2024 Census, "Population by Province, City, Municipality, and Barangay" ----------------
// Layout per province sheet: an ALL-CAPS row is a municipality/city total,
// followed by its barangay rows (mixed case) until the next ALL-CAPS row.

function loadPopulationStats(file) {
  if (!file) return new Map();
  const wb = XLSX.readFile(file, { sheets: ['Pangasinan'] });
  const ws = wb.Sheets['Pangasinan'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  const out = new Map();
  let currentMuni = null;
  for (const r of rows) {
    const name = r[1];
    const pop = r[3];
    if (!name || typeof name !== 'string') continue;
    const trimmed = name.trim();
    if (trimmed === 'PANGASINAN' || trimmed.startsWith('Source')) continue;
    const isMuniRow = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
    if (isMuniRow) {
      currentMuni = trimmed;
      continue;
    }
    if (!currentMuni || typeof pop !== 'number') continue;
    out.set(key(currentMuni, trimmed), { population: pop });
  }
  return out;
}

function carpPoints(pctDistributed, hasCarpArea) {
  if (!hasCarpArea) return null;
  if (pctDistributed == null) return null;
  if (pctDistributed >= 80) return 20;
  if (pctDistributed >= 50) return 15;
  return 10;
}

// ---------------- merge ----------------

const arbStats = loadArbStats(ARB_LIST_XLSX);
const bgysStats = loadBgysStats(VF_FORMS_XLSX);
const popStats = loadPopulationStats(POPULATION_XLSX);

const allKeys = new Set([...arbStats.keys(), ...bgysStats.keys()]);
const merged = [];
let popMatched = 0;
for (const k of allKeys) {
  const a = arbStats.get(k);
  const b = bgysStats.get(k);
  const p = popStats.get(k);
  if (p) popMatched++;
  const municipality = (a && a.municipality) || '';
  const barangay = (a && a.barangay) || '';
  const distributedAreaHa = a ? a.distributedAreaHa : 0;
  const arbCount = a ? a.arbCount : 0;
  const totalAgriLandHa = b ? b.totalAgriLandHa : null;
  // "Total Agri Land" comes from a 1993-2015 ARC baseline and is sometimes
  // smaller than land distributed since — clamp the displayed % at 100.
  const pctDistributed = totalAgriLandHa ? Math.min(100, Math.round((distributedAreaHa / totalAgriLandHa) * 1000) / 10) : null;

  merged.push({
    municipality,
    barangay,
    key: k,
    arcId: b ? b.arcId : null,
    arcName: b ? b.arcName : null,
    arcType: b ? b.arcType : null,
    arcClassification: b ? b.arcClassification : null,
    arbHousehold: b ? b.arbHousehold : null,
    arbCount,
    distributedAreaHa,
    totalAgriLandHa,
    pctDistributed,
    carpAreaScore: carpPoints(pctDistributed, distributedAreaHa > 0),
    population: p ? p.population : null,
  });
}

merged.sort((x, y) => x.municipality.localeCompare(y.municipality) || x.barangay.localeCompare(y.barangay));

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(merged));
console.log(`Wrote ${merged.length} barangay records to ${OUT_FILE}`);
console.log(`ARB list barangays: ${arbStats.size}, Bgys/ARC barangays: ${bgysStats.size}, population barangays loaded: ${popStats.size}, matched into output: ${popMatched}`);
