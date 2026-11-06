#!/usr/bin/env node
/**
 * Ingest the two NASA NSSDCA lunar tables:
 *
 *   1. https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html
 *      Apollo landing site coordinates (LRO-derived, Mean Earth/Polar Axis).
 *   2. https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html
 *      "Table of Anthropogenic Impacts and Spacecraft on the Moon".
 *
 * Writes `data/ingested/nssdca-apollo-sites.json` and
 * `data/ingested/nssdca-lunar-artifacts.json` in the shape the build expects.
 *
 * Usage:
 *   node scripts/ingest/nssdca-moon.mjs                     # fetch live pages
 *   node scripts/ingest/nssdca-moon.mjs --from=dir          # parse saved HTML
 *   node scripts/ingest/nssdca-moon.mjs --check             # parse, do not write
 *
 * `--from=dir` expects the files `lunar_sites.html` and
 * `lunar_artifact_impacts.html` inside `dir` (a browser "Save page as" copy is
 * fine). If a page cannot be fetched the script stops with a non-zero exit code
 * and the committed snapshot stays untouched — no coordinates are invented.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  cleanText,
  columnIndex,
  fetchOrRead,
  headerRow,
  parseDate,
  parseLatLon,
  readTables,
  tableRows,
} from './lib/html.mjs';

const TODAY = new Date().toISOString().slice(0, 10);
const args = process.argv.slice(2);
const fromArg = args.find((a) => a.startsWith('--from='));
const fromDir = fromArg ? fromArg.slice('--from='.length) : null;
const checkOnly = args.includes('--check');

const SOURCES = {
  sites: {
    url: 'https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html',
    file: 'lunar_sites.html',
    datasetId: 'nssdca-apollo-sites',
    title: 'Apollo Landing Site Coordinates',
    notes:
      'Site coordinates are based on the planetocentric Mean Earth/Polar Axis Lunar Reference System (DE421 ephemeris) and were determined from Lunar Reconnaissance Orbiter images (Wagner et al., Icarus 283, pp. 92-103, 2017). Longitudes are stored as degrees east in -180..180; the source page prints degrees E (0..360).',
  },
  artifacts: {
    url: 'https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html',
    file: 'lunar_artifact_impacts.html',
    datasetId: 'nssdca-lunar-artifacts',
    title: 'Table of Anthropogenic Impacts and Spacecraft on the Moon',
    notes:
      'Machine-readable snapshot of the NSSDCA table. "match" mirrors the source row label. Rows flagged imaged were identified on the surface in Lunar Reconnaissance Orbiter Camera images. Longitudes are stored as degrees east in -180..180; the source page prints 0..360.',
  },
};

/** Pick the table on the page that actually carries lat/lon columns. */
function coordinateTable(tables) {
  for (const table of tables) {
    const header = headerRow(table);
    if (columnIndex(header, [/latitude|^lat\b/i]) >= 0 && columnIndex(header, [/longitude|^lon\b/i]) >= 0) {
      return { table, header };
    }
    // some NSSDCA tables print a single "Coordinates" column
    if (columnIndex(header, [/coordinate/i]) >= 0) return { table, header };
  }
  return null;
}

function parseSites(html) {
  const { tables } = readTables(html);
  const found = coordinateTable(tables);
  if (!found) throw new Error('no latitude/longitude table found on lunar_sites.html');
  const { table, header } = found;

  const nameCol = Math.max(
    columnIndex(header, [/site|spacecraft|mission|name/i]),
    0,
  );
  const latCol = columnIndex(header, [/latitude|^lat\b/i]);
  const lonCol = columnIndex(header, [/longitude|^lon\b/i]);
  const coordCol = columnIndex(header, [/coordinate/i]);
  const dateCol = columnIndex(header, [/date|year/i]);

  const records = [];
  for (const row of tableRows(table, header)) {
    const label = cleanText(row.cells[nameCol]);
    if (!label) continue;
    const rawCoords =
      coordCol >= 0 ? cleanText(row.cells[coordCol]) : `${row.cells[latCol] ?? ''}, ${row.cells[lonCol] ?? ''}`;
    const { lat, lon, raw } = parseLatLon(rawCoords);
    const spacecraft = label.split(/\s+LRRR|\s+LM$|\s+ALSEP|\s+SIV-B|\s+S-IVB/)[0] || label;
    records.push({
      match: label,
      spacecraft: cleanText(spacecraft),
      type: /LRRR/i.test(label) ? 'LRRR' : /ALSEP/i.test(label) ? 'ALSEP' : /LM\b/i.test(label) ? 'Lunar Module' : 'Site',
      date: dateCol >= 0 ? parseDate(row.cells[dateCol]) : null,
      lat,
      lon,
      raw,
    });
  }
  if (!records.length) throw new Error('lunar_sites.html parsed to zero records');
  return records;
}

function parseArtifacts(html) {
  const { tables } = readTables(html);
  const found = coordinateTable(tables);
  if (!found) throw new Error('no coordinate table found on lunar_artifact_impacts.html');
  const { table, header } = found;

  const nameCol = Math.max(columnIndex(header, [/spacecraft|object|item|name/i]), 0);
  const latCol = columnIndex(header, [/latitude|^lat\b/i]);
  const lonCol = columnIndex(header, [/longitude|^lon\b/i]);
  const coordCol = columnIndex(header, [/coordinate/i]);
  const dateCol = columnIndex(header, [/date|year/i]);
  const typeCol = columnIndex(header, [/type|object|description/i]);
  const imagedCol = columnIndex(header, [/image|identif|lroc/i]);

  const records = [];
  for (const row of tableRows(table, header)) {
    const label = cleanText(row.cells[nameCol]);
    if (!label) continue;
    const rawCoords =
      coordCol >= 0 ? cleanText(row.cells[coordCol]) : `${row.cells[latCol] ?? ''}, ${row.cells[lonCol] ?? ''}`;
    const { lat, lon, raw } = parseLatLon(rawCoords);
    const imagedText = imagedCol >= 0 ? cleanText(row.cells[imagedCol]) : '';
    const note = coordCol >= 0 || lat === null ? 'coordinates not resolvable in the source table' : undefined;
    records.push({
      match: label,
      spacecraft: label,
      type: typeCol >= 0 ? cleanText(row.cells[typeCol]) : 'Object',
      date: dateCol >= 0 ? parseDate(row.cells[dateCol]) : null,
      lat,
      lon,
      raw,
      imaged: /y|yes|✓|imaged/i.test(imagedText),
      ...(note ? { note } : {}),
    });
  }
  if (!records.length) throw new Error('lunar_artifact_impacts.html parsed to zero records');
  return records;
}

async function buildSource(spec, parser) {
  const from = fromDir ? path.join(fromDir, spec.file) : null;
  let page;
  try {
    page = await fetchOrRead(spec.url, from);
  } catch (error) {
    throw new Error(
      `${spec.url} could not be read (${error.message}).\n` +
        `  Save the page manually and re-run with --from=<dir>, or keep the committed snapshot in data/ingested/.`,
    );
  }
  const records = parser(page.html);
  const unresolved = records.filter((r) => r.lat === null || r.lon === null);
  return {
    payload: {
      datasetId: spec.datasetId,
      title: spec.title,
      publisher: 'NASA NSSDCA (Dr. David R. Williams)',
      url: spec.url,
      retrieved: TODAY,
      notes: spec.notes,
      records,
    },
    unresolved,
    sourceKind: page.source,
    recordCount: records.length,
  };
}

async function main() {
  await mkdir('data/ingested', { recursive: true });
  const results = [];
  for (const [key, spec] of Object.entries(SOURCES)) {
    const parser = key === 'sites' ? parseSites : parseArtifacts;
    const { payload, unresolved, sourceKind, recordCount } = await buildSource(spec, parser);
    results.push({ spec, recordCount, unresolved, sourceKind });
    if (!checkOnly) {
      await writeFile(`data/ingested/${spec.datasetId}.json`, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    }
    console.log(
      `✓ ${spec.datasetId}: ${recordCount} rows from ${sourceKind}` +
        (unresolved.length ? ` (${unresolved.length} without a readable coordinate)` : ''),
    );
    for (const row of unresolved.slice(0, 5)) console.warn(`  ⚠ no coordinate: ${row.match} — "${row.raw}"`);
  }
  if (checkOnly) console.log('(check mode: nothing written)');
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
