/**
 * Shared helpers for the ingestion scripts.
 *
 * The point of this layer is reproducibility: every ingested snapshot in
 * `data/ingested/` can be regenerated from the publisher's own page, and the
 * build refuses to invent values when a page cannot be parsed. Nothing here
 * guesses a coordinate — an unparsable cell becomes `null` and is reported.
 */
import { load } from 'cheerio';
import { readFile } from 'node:fs/promises';

export const USER_AGENT =
  'AbandonedButNotForgotten/1.0 (NASA Space Apps Challenge; dataset build script)';

/**
 * Fetch a page, or read a local HTML snapshot when `fromPath` is provided or the
 * network is unavailable. Returns `{ html, source }` where source is
 * 'network' | 'file'.
 */
export async function fetchOrRead(url, fromPath) {
  if (fromPath) {
    return { html: await readFile(fromPath, 'utf8'), source: 'file' };
  }
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return { html: await response.text(), source: 'network' };
}

/** Every <table> in the document, with a normalised header row. */
export function readTables(html) {
  const $ = load(html);
  const tables = [];
  $('table').each((index, element) => {
    const rows = [];
    $(element)
      .find('tr')
      .each((_i, tr) => {
        const cells = $(tr)
          .find('th,td')
          .map((_j, cell) => cleanText($(cell).text()))
          .get()
          .filter((text, i, all) => !(text === '' && i === all.length - 1));
        if (cells.length) rows.push({ cells, isHeader: $(tr).find('th').length > 0 });
      });
    tables.push({ index, rows });
  });
  return { $, tables };
}

/** Prefer the header row; fall back to the first row when a page has no <th>. */
export function headerRow(table) {
  const header = table.rows.find((row) => row.isHeader);
  if (header) return header.cells;
  return table.rows[0]?.cells ?? [];
}

/** Column index whose header matches one of the regular expressions. */
export function columnIndex(header, patterns) {
  for (const pattern of patterns) {
    const found = header.findIndex((cell) => pattern.test(cell));
    if (found >= 0) return found;
  }
  return -1;
}

export function cleanText(value) {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse a published coordinate pair.
 *
 * Accepts the forms the NASA source pages actually use:
 *   "0.67416 N, 23.47314 E"   "3.0098 S, 23.4249 W"
 *   "30 N 0 E"                "312.05 E, 22.27 N"
 *   "77.45E, 18.44N"          "-47.95, 22.27"
 *
 * Returns degrees in −180…180 (east positive), or nulls when a value cannot be
 * read. `raw` is always preserved so the original string survives the import.
 */
export function parseLatLon(raw) {
  const text = cleanText(raw);
  if (!text) return { lat: null, lon: null, raw: text };

  const normalised = text
    .replace(/[°º]/g, ' ')
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = [];
  for (const match of normalised.matchAll(/(-?\d+(?:\.\d+)?)\s*([NSEW])?/gi)) {
    tokens.push({ value: Number(match[1]), hemisphere: (match[2] || '').toUpperCase() });
  }

  let lat = null;
  let lon = null;
  const unlabelled = [];
  for (const token of tokens) {
    if (token.hemisphere === 'N' || token.hemisphere === 'S') {
      if (lat === null) lat = token.value * (token.hemisphere === 'S' ? -1 : 1);
    } else if (token.hemisphere === 'E' || token.hemisphere === 'W') {
      if (lon === null) lon = normaliseLongitude(token.value * (token.hemisphere === 'W' ? -1 : 1));
    } else {
      unlabelled.push(token.value);
    }
  }

  // Unlabelled pairs follow the page order: latitude first, then longitude.
  // A lone value wider than 90° can only be a longitude.
  for (const value of unlabelled) {
    if (lat === null && Math.abs(value) <= 90) lat = value;
    else if (lon === null) lon = normaliseLongitude(value);
  }

  return { lat, lon, raw: text };
}

export function normaliseLongitude(value) {
  if (!Number.isFinite(value)) return null;
  let lon = value;
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return Number(lon.toFixed(5));
}

/** ISO date from sources that print "20 July 1969" / "1969-07-20" / "Jul 1969". */
const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function parseDate(raw) {
  const text = cleanText(raw);
  if (!text) return null;
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dayMonthYear = text.match(/(\d{1,2})[ .-]?([A-Za-z]{3,})[ .-]?(\d{4})/);
  if (dayMonthYear) {
    const month = MONTHS[dayMonthYear[2].slice(0, 3).toLowerCase()];
    if (month) {
      return `${dayMonthYear[3]}-${String(month).padStart(2, '0')}-${String(Number(dayMonthYear[1])).padStart(2, '0')}`;
    }
  }

  const monthYear = text.match(/([A-Za-z]{3,})[ .-]?(\d{4})/);
  if (monthYear) {
    const month = MONTHS[monthYear[1].slice(0, 3).toLowerCase()];
    if (month) return `${monthYear[2]}-${String(month).padStart(2, '0')}-01`;
  }

  const year = text.match(/(19|20)\d{2}/);
  if (year) return String(year[0]);
  return null;
}

export function tableRows(table, header) {
  const startIndex = table.rows.findIndex((row) => row === table.rows.find((r) => r.isHeader)) + 1;
  return table.rows.slice(startIndex || 1).filter((row) => row.cells.length >= 2);
}
