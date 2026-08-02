#!/usr/bin/env node
// Builds data/barangay-boundaries.json — real barangay polygon boundaries for
// every municipality/city in Pangasinan, used by the Validation Form's
// adjacent-barangay detection (VF_findAdjacent in index.html).
//
// Previously that detection only covered ~9 municipalities (a hand-picked
// OSM-derived `rf` object embedded in index.html, still used as-is by the
// separate ARC Map feature — this script does not touch that). This adds
// full province-wide coverage from PSA-sourced PSGC boundaries.
//
// Source: barangay/sub-municipality-level GeoJSON files from
// https://github.com/faeldon/philippines-json-maps (MIT licensed), one file
// per municipality, named bgysubmuns-municity-<adm3_psgc>.0.1.json, plus the
// province-level file listing each municipality's PSGC code and name.
//
// Usage:
//   PROVDIST_JSON=/path/to/municities-provdist-105500000.0.001.json \
//   MUNICITY_BGY_DIR=/path/to/municities/hires \
//   node scripts/validation-form/build-barangay-boundaries.js
'use strict';

const fs = require('fs');
const path = require('path');

const PROVDIST_JSON = process.env.PROVDIST_JSON;
const MUNICITY_BGY_DIR = process.env.MUNICITY_BGY_DIR;
const OUT_FILE = path.join(__dirname, '..', '..', 'data', 'barangay-boundaries.json');

if (!PROVDIST_JSON || !MUNICITY_BGY_DIR) {
  console.error('Set PROVDIST_JSON and MUNICITY_BGY_DIR env vars to the source GeoJSON paths.');
  process.exit(1);
}

// Matches the display convention already used in arb-barangay-stats.json
// ("ALAMINOS CITY", not "CITY OF ALAMINOS" or "City of Alaminos").
function normMuni(s) {
  let m = String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
  const cityOf = m.match(/^CITY OF (.+)$/);
  if (cityOf) m = cityOf[1] + ' CITY';
  return m;
}
function normBrgy(s) {
  return String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

const provdist = JSON.parse(fs.readFileSync(PROVDIST_JSON, 'utf8'));
const out = [];
let barangayCount = 0;
let multiPartCount = 0;

for (const muniFeature of provdist.features) {
  const code = muniFeature.properties.adm3_psgc;
  const municipality = normMuni(muniFeature.properties.adm3_en);
  const file = path.join(MUNICITY_BGY_DIR, `bgysubmuns-municity-${code}.0.1.json`);
  if (!fs.existsSync(file)) {
    console.error(`Missing barangay file for ${municipality} (${code}): ${file}`);
    continue;
  }
  const bgys = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const feat of bgys.features) {
    const barangay = normBrgy(feat.properties.adm4_en);
    const geom = feat.geometry;
    let rings;
    if (geom.type === 'Polygon') {
      rings = [geom.coordinates[0]];
    } else if (geom.type === 'MultiPolygon') {
      rings = geom.coordinates.map((poly) => poly[0]);
      multiPartCount++;
    } else {
      console.error(`Unexpected geometry type ${geom.type} for ${municipality}/${barangay}`);
      continue;
    }
    // Round to ~1m precision — plenty for a proximity-based adjacency check,
    // meaningfully shrinks the output file.
    rings = rings.map((ring) => ring.map(([lng, lat]) => [Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5]));
    out.push({ municipality, barangay, rings });
    barangayCount++;
  }
}

out.sort((a, b) => a.municipality.localeCompare(b.municipality) || a.barangay.localeCompare(b.barangay));

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(out));
console.log(`Wrote ${barangayCount} barangay boundaries (${multiPartCount} multi-part) to ${OUT_FILE}`);
