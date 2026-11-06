#!/usr/bin/env node
/**
 * Ingest the NASA GISS Mars24 lander catalogue:
 *   https://www.giss.nasa.gov/tools/mars24/help/landers.html
 *
 * The page publishes planetocentric east longitude in the 0–360° convention;
 * this script converts to −180…180, keeps the original string in `raw`, and
 * writes `data/ingested/giss-mars-landers.json`.
 *
 * Usage:
 *   node scripts/ingest/giss-mars24.mjs
 *   node scripts/ingest/giss-mars24.mjs --from=dir     # parse a saved landers.html
 *   node scripts/ingest/giss-mars24.mjs --check
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

const URL =
  'https://www.giss.nasa.gov/tools/mars24/help/landers.html';
const TODAY = new Date().toISOString().slice(0, 10);
const args = process.argv.slice(2);
const fromArg = args.find((a) => a.startsWith('--from='));
const checkOnly = args.includes('--check');

function parse(html) {
  const { tables } = readTables(html);
  let chosen = null;
  for (const table of tables) {
    const header = headerRow(table);
    const hasLat = columnIndex(header, [/latitude|^lat\b/i]) >= 0;
    const hasLon = columnIndex(header, [/longitude|^lon\b/i]) >= 0;
    const hasCoord = columnIndex(header, [/coordinate/i]) >= 0;
    if ((hasLat && hasLon) || hasCoord) {
      chosen = { table, header };
      break;
    }
  }
  if (!chosen) throw new Error('no coordinate table found on the Mars24 lander page');
  const { table, header } = chosen;

  const nameCol = Math.max(columnIndex(header, [/lander|mission|spacecraft|name/i]), 0);
  const latCol = columnIndex(header, [/latitude|^lat\b/i]);
  const lonCol = columnIndex(header, [/longitude|^lon\b/i]);
  const coordCol = columnIndex(header, [/coordinate/i]);
  const dateCol = columnIndex(header, [/date/i]);
  const siteCol = columnIndex(header, [/site|location/i]);
  const typeCol = columnIndex(header, [/type/i]);

  const records = [];
  for (const row of tableRows(table, header)) {
    const name = cleanText(row.cells[nameCol]);
    if (!name || /^lander$/i.test(name)) continue;
    const rawCoords =
      coordCol >= 0 ? cleanText(row.cells[coordCol]) : `${row.cells[latCol] ?? ''}, ${row.cells[lonCol] ?? ''}`;
    const { lat, lon, raw } = parseLatLon(rawCoords);
    const spacecraft = cleanText(name.replace(/\s+(Lander|Rover|Station)$/i, ''));
    records.push({
      match: name,
      spacecraft,
      type: typeCol >= 0 ? cleanText(row.cells[typeCol]) : /rover/i.test(name) ? 'Rover' : 'Stationary lander',
      date: dateCol >= 0 ? parseDate(row.cells[dateCol]) : null,
      lat,
      lon,
      raw,
      ...(siteCol >= 0 ? { site: cleanText(row.cells[siteCol]) } : {}),
    });
  }
  if (!records.length) throw new Error('Mars24 page parsed to zero records');
  return records;
}

async function main() {
  const from = fromArg ? path.join(fromArg.slice('--from='.length), 'landers.html') : null;
  let page;
  try {
    page = await fetchOrRead(URL, from);
  } catch (error) {
    throw new Error(
      `${URL} could not be read (${error.message}).\n` +
        '  Save the page manually and re-run with --from=<dir>, or keep the committed snapshot in data/ingested/.',
    );
  }

  const records = parse(page.html);
  const payload = {
    datasetId: 'giss-mars-landers',
    title: 'Mars24 Sunclock — Mars Lander Missions',
    publisher: 'NASA Goddard Institute for Space Studies',
    url: URL,
    retrieved: TODAY,
    notes:
      'NASA Mars lander catalogue. Coordinates are planetocentric east longitude as published, converted here to -180..180. Source acknowledgements: VL1, VL2 and MPF from Kuchynka et al. (2014); Beagle 2 from Bridges et al. (2017); MER-A/MER-B from Li et al. (2005, 2006, 2007); Phoenix provided by D. Bass; MSL provided by A. Vasavada, B. Semenov and J. Crisp; InSight provided by B. Semenov.',
    records,
  };

  const unresolved = records.filter((r) => r.lat === null || r.lon === null);
  if (!checkOnly) {
    await mkdir('data/ingested', { recursive: true });
    await writeFile('data/ingested/giss-mars-landers.json', `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }
  console.log(
    `✓ giss-mars-landers: ${records.length} rows from ${page.source}` +
      (unresolved.length ? ` (${unresolved.length} without a readable coordinate)` : ''),
  );
  for (const row of unresolved.slice(0, 5)) console.warn(`  ⚠ no coordinate: ${row.match} — "${row.raw}"`);
  if (checkOnly) console.log('(check mode: nothing written)');
}

main().catch((error) => {
  console.error(`✗ ${error.message}`);
  process.exit(1);
});
