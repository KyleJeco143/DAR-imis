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
function stripDiacritics(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function normMuni(s) {
  let m = stripDiacritics(String(s || '')).trim().toUpperCase().replace(/\s+/g, ' ');
  m = m.replace(/^CITY OF /, '').replace(/ CITY$/, '');
  m = m.replace(/^STA\.?\s/, 'SANTA ').replace(/^STO\.?\s/, 'SANTO ');
  return MUNI_FIXES[m] || m;
}
function normBrgy(s) {
  return stripDiacritics(String(s || '')).trim().toUpperCase().replace(/\s+/g, ' ');
}

// The ARB list, Bgys sheet, and PSA population sheet each spell a fair
// number of barangays differently enough that a plain normBrgy() join
// misses them (typos, transposed letters, "Sta."/"Sto." abbreviated one
// place and spelled out another, hyphens vs spaces, stray periods). This
// expands abbreviations and strips punctuation that never carries meaning,
// then routes through a curated alias table for the remaining genuine
// same-place spelling variants found by cross-checking every unmatched
// barangay in data/arb-barangay-stats.json against the PSA population list
// (see scripts/validation-form/README.md's "barangay name variants" note).
// Two different real places (e.g. directional/numbered splits like "Carmay
// East" vs "Carmay West", or "San Aurelio 1st/2nd/3rd") are deliberately
// NOT aliased together, even when they look similar.
function keyBrgyBase(s) {
  let b = normBrgy(s);
  b = b.replace(/^STA\.?\s/, 'SANTA ').replace(/^STO\.?\s/, 'SANTO ');
  b = b.replace(/\./g, '');
  return b;
}
const KNOWN_BARANGAY_ALIASES = {};
function addAlias(muni, from, to) {
  KNOWN_BARANGAY_ALIASES[`${normMuni(muni)}|${keyBrgyBase(from)}`] = `${normMuni(muni)}|${keyBrgyBase(to)}`;
}
[
  ['AGNO', 'Allabom', 'Allabon'],
  ['AGNO', 'Macabubuni', 'Macaboboni'],
  ['AGUILAR', 'Bacacleo', 'Bocacliw'],
  ['AGUILAR', 'Bagumban (Laoag)', 'Laoag'],
  ['AGUILAR', 'Manlocoboc', 'Manlocboc'],
  ['ALCALA', 'Pindanganan East', 'Pindangan East'],
  ['ALCALA', 'San Pedro III', 'San Pedro Ili'],
  ['ANDA', 'Macando-Candong', 'Macandocandong'],
  ['ANDA', 'Malong', 'Mal-ong'],
  ['ANDA', 'Sitios of Poblacion', 'Poblacion'],
  ['ASINGAN', 'Ariston Oeste', 'Ariston Weste'],
  ['ASINGAN', 'Ariston West', 'Ariston Weste'],
  ['ASINGAN', 'Bantug', 'Bantog'],
  ['ASINGAN', 'Carusocan Sur', 'Carosucan Sur'],
  ['ASINGAN', 'Domampot', 'Domanpot'],
  ['BALUNGAO', 'San Aurelio I', 'San Aurelio 1st'],
  ['BALUNGAO', 'San Aurelio III', 'San Aurelio 3rd'],
  ['BANI', 'Banlag', 'Ballag'],
  ['BANI', 'Quinadayanan', 'Quinaoayanan'],
  ['BAYAMBANG', 'Alingan', 'Alinggan'],
  ['BAYAMBANG', 'Ambayat 1st', 'Ambayat I'],
  ['BAYAMBANG', 'Ambayat 2nd', 'Ambayat II'],
  ['BAYAMBANG', 'Batangcawa', 'Batangcaoa'],
  ['BAYAMBANG', 'Bongato Este', 'Bongato East'],
  ['BAYAMBANG', 'Buenlag Primero', 'Buenlag 1st'],
  ['BAYAMBANG', 'Buenlag Segundo', 'Buenlag 2nd'],
  ['BAYAMBANG', 'Hermosa', 'Hermoza'],
  ['BAYAMBANG', 'Inanlorenzana', 'Inanlorenza'],
  ['BAYAMBANG', 'Languiran', 'Langiran'],
  ['BAYAMBANG', 'Poblacion', 'Poblacion Sur'],
  ['BAYAMBANG', 'Pogo', 'Pugo'],
  ['BINALONAN', 'Mancasuy', 'Mangcasuy'],
  ['BINALONAN', 'Mangcasoy', 'Mangcasuy'],
  ['BINMALEY', 'Canadalan', 'Canaoalan'],
  ['BOLINAO', 'Catungui', 'Catungi'],
  ['BUGALLON', 'Anagao', 'Banaga'],
  ['BUGALLON', 'Salomague-Norte', 'Salomague Norte'],
  ['BUGALLON', 'Salomague-Sur', 'Salomague Sur'],
  ['CALASIAO', 'Ambunao', 'Ambonao'],
  ['CALASIAO', 'Dinalaon', 'Dinalaoan'],
  ['CALASIAO', 'Dinaloan', 'Dinalaoan'],
  ['DASOL', 'Osmena Sr', 'Osmena'],
  ['LABRADOR', 'Lawis', 'Laois'],
  ['LABRADOR', 'Tubuan', 'Tobuan'],
  ["LAOAC", "D'Alarcio", 'Domingo Alarcio'],
  ['LAOAC', 'Nambagatan', 'Nanbagatan'],
  ['LINGAYEN', 'Baseng', 'Basing'],
  ['LINGAYEN', 'Dumalandan West', 'Domalandan West'],
  ['LINGAYEN', 'Malipuec', 'Malimpuec'],
  ['LINGAYEN', 'Matalaba', 'Matalava'],
  ['LINGAYEN', 'Pangapisan Norte', 'Pangapisan North'],
  ['MABINI', 'Caabiangan', 'Caabiangaan'],
  ['MALASIQUI', 'Banaoang', 'Banawang'],
  ['MALASIQUI', 'Lareglareg', 'Lareg-Lareg'],
  ['MALASIQUI', 'Mangan Dampay', 'Manggan-Dampay'],
  ['MALASIQUI', 'Tabo Sili', 'Tabo-Sili'],
  ['MANAOAG', 'Calaocan (Sapang Norte)', 'Calaocan'],
  ['MANAOAG', 'Leleman', 'Lelemaan'],
  ['MANAOAG', 'Matulong', 'Matolong'],
  ['MANGATAREM', 'Bunao', 'Bueno'],
  ['MANGATAREM', 'Calvo St.', 'Calvo'],
  ['MANGATAREM', 'Dorongan Keteket', 'Dorongan Ketaket'],
  ['MANGATAREM', 'Old Cacamposan', 'Olo Cacamposan'],
  ['MANGATAREM', 'Old-Cafabrosan', 'Olo Cafabrosan'],
  ['MANGATAREM', 'Old-Cagarlitan', 'Olo Cagarlitan'],
  ['MANGATAREM', 'Sawat', 'Dorongan Sawat'],
  ['MANGATAREM', 'Tagak', 'Tagac'],
  ['MAPANDAN', 'Amandaoac', 'Amanoaoac'],
  ['ROSALES', 'Bakitbakit', 'Bakit-Bakit'],
  ['ROSALES', 'Balincanaway', 'Balingcanaway'],
  ['ROSALES', 'Borobor Site (Zone IV)', 'Zone IV'],
  ['ROSALES', 'Carmay Weste', 'Carmay West'],
  ['ROSALES', 'San Pedro Este', 'San Pedro East'],
  ['ROSALES', 'San Pedro Weste', 'San Pedro West'],
  ['ROSALES', 'Tomana Este', 'Tomana East'],
  ['SAN FABIAN', 'Ambalangan Dalin', 'Ambalangan-Dalin'],
  ['SAN FABIAN', 'Nibaliw Centro', 'Nibaliw Central'],
  ['SAN MANUEL', 'Arzadon', 'San Antonio-Arzadon'],
  ['SAN NICOLAS', 'Cacabungaoan', 'Cacabugaoan'],
  ['SAN QUINTIN', 'Casantamari-an', 'Casantamarian'],
  ['SAN QUINTIN', 'Casantamaria-an', 'Casantamarian'],
  ['SAN QUINTIN', 'Nangapogan', 'Nangapugan'],
  ['SANTA BARBARA', 'Carusucan', 'Carusocan'],
  ['SANTA BARBARA', 'Matic-Matic', 'Maticmatic'],
  ['SANTA BARBARA', 'Patayak', 'Patayac'],
  ['SANTA BARBARA', 'Songuil', 'Sonquil'],
  ['SISON', 'Bantay Intsik', 'Bantay Insik'],
  ['SISON', 'Bolaoen East', 'Bulaoen East'],
  ['SISON', 'Bolaoen West', 'Bulaoen West'],
  ['SISON', 'Dongon', 'Dungon'],
  ['SISON', 'Killo-Macao', 'Killo'],
  ['SUAL', 'Baquiden', 'Baquioen'],
  ['SUAL', 'Calomboyan', 'Calumbuyan'],
  ['SUAL', 'Macaycayaoan', 'Macaycayawan'],
  ['SUAL', 'Sidacio West', 'Sioasio West'],
  ['SUAL', 'Sidasio East', 'Sioasio East'],
  ['TAYUG', 'Crisanto Lichauco', 'C. Lichauco'],
  ['TAYUG', 'Lichauco', 'C. Lichauco'],
  ['UMINGAN', 'Abot-Molina', 'Abot Molina'],
  ['UMINGAN', 'Don Abalos', 'Don Justo Abalos'],
  ['UMINGAN', 'Masell-Sell', 'Maseil-Seil'],
  ['UMINGAN', 'Masiel-Siel', 'Maseil-Seil'],
  ['UMINGAN', 'Tangal-Sawang', 'Tanggal Sawang'],
  ['URBIZTONDO', 'Batangcaoa', 'Batancaoa'],
  ['URBIZTONDO', 'Camanbugan', 'Camambugan'],
  ['URBIZTONDO', 'Pasibe East', 'Pasibi East'],
  ['VILLASIS', 'Baranggobong', 'Barangobong'],
].forEach(([muni, from, to]) => addAlias(muni, from, to));

// Some barangay names are data-entry placeholders, not real places — drop
// rows carrying them entirely rather than showing a fake "NULL" barangay.
const PLACEHOLDER_BARANGAYS = new Set(['NULL', 'N/A', '']);

function keyBrgy(s) {
  const b = keyBrgyBase(s);
  return b;
}
function key(muni, brgy) {
  const k = `${normMuni(muni)}|${keyBrgy(brgy)}`;
  return KNOWN_BARANGAY_ALIASES[k] || k;
}

// Same real municipality is spelled inconsistently across ROWS too (e.g.
// "Alaminos" on one barangay's row, "Alaminos City" on another's; "Sto.
// Tomas" vs "Santo Tomas") — normMuni() unifies them for joining, but each
// merged record still shows whatever raw text happened to populate it,
// which re-splits the same municipality into two dropdown entries. Track
// every raw spelling seen per join key so the merge step can pick one
// consistent display string per municipality.
const muniVariantsByKey = new Map();
function trackMuniVariant(muni) {
  const k = normMuni(muni);
  const raw = normBrgy(muni);
  if (!muniVariantsByKey.has(k)) muniVariantsByKey.set(k, new Set());
  muniVariantsByKey.get(k).add(raw);
}
function muniDisplay(muni) {
  const k = normMuni(muni);
  const variants = muniVariantsByKey.get(k);
  const isCity = variants && [...variants].some((v) => / CITY$/.test(v) || /^CITY OF /.test(v));
  return isCity ? `${k} CITY` : k;
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
    if (PLACEHOLDER_BARANGAYS.has(String(brgy).trim().toUpperCase())) continue;
    trackMuniVariant(muni);
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
    if (PLACEHOLDER_BARANGAYS.has(String(r[cBrgy]).trim().toUpperCase())) continue;
    trackMuniVariant(r[cMuni]);
    const k = key(r[cMuni], r[cBrgy]);
    // A barangay can belong to more than one ARC record across years; keep the one with the largest total agri land figure.
    const agriLand = Number(r[cAgriLand]) || 0;
    const existing = out.get(k);
    if (existing && existing.totalAgriLandHa >= agriLand) continue;
    out.set(k, {
      municipality: String(r[cMuni] || '').trim(),
      barangay: String(r[cBrgy] || '').trim(),
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
    if (PLACEHOLDER_BARANGAYS.has(trimmed.toUpperCase())) continue;
    // A few PSA cells hold a numeric-typed barangay "name" like 1 or 2 that
    // Excel round-trips as "1.0"/"2.0" (e.g. Bolinao's "Lucients 1"/"2").
    const cleaned = trimmed.replace(/\.0$/, '');
    trackMuniVariant(currentMuni);
    // Population is the ground truth for spelling — keep its raw text (used
    // for display) alongside the join key.
    out.set(key(currentMuni, cleaned), { population: pop, barangay: cleaned });
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
  // Municipality display is picked from ALL raw spellings seen for this
  // municipality across every barangay row (see muniDisplay()), so it no
  // longer splits into duplicates like "Alaminos"/"Alaminos City" or
  // "Santo Tomas"/"Sto. Tomas" depending on which record happened to carry
  // which spelling. Barangay display prefers the population sheet's
  // spelling (our ground truth) when a match exists, else falls back to
  // whichever source populated this record.
  const municipality = muniDisplay((a && a.municipality) || (b && b.municipality) || '');
  const barangay = normBrgy((p && p.barangay) || (a && a.barangay) || (b && b.barangay) || '');
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

// Distributed area per ARB is normally close to a hectare (province-wide
// median is ~1 ha/ARB) — DAR CARP lots are rarely more than a few hectares
// each. A barangay whose summed AREA (Sq. M.) works out to tens of hectares
// per beneficiary usually means the source list has a duplicate lot row (the
// same ARB's lot counted twice, which inflates distributedAreaSqm but not
// arbIds.size) or a stray unit mismatch on one row, not a real distribution.
// This doesn't correct the figure — we can't tell which row is wrong from
// the aggregate — it just flags it for a manual look at the source file.
const ANOMALY_HA_PER_ARB = 15;
const anomalies = merged
  .filter((r) => r.arbCount > 0 && r.distributedAreaHa / r.arbCount > ANOMALY_HA_PER_ARB)
  .sort((x, y) => y.distributedAreaHa / y.arbCount - x.distributedAreaHa / x.arbCount);
if (anomalies.length) {
  console.warn(`\n${anomalies.length} barangay(s) have an implausible distributed-area-per-ARB ratio (>${ANOMALY_HA_PER_ARB} ha/ARB) — worth checking ${path.basename(ARB_LIST_XLSX)} by hand for a duplicate row or unit mismatch:`);
  for (const r of anomalies) {
    console.warn(`  ${r.municipality} / ${r.barangay}: ${r.distributedAreaHa} ha across ${r.arbCount} ARBs (${(r.distributedAreaHa / r.arbCount).toFixed(1)} ha/ARB)`);
  }
}
