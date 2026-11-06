import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const CURATED_DIR = path.join(DATA_DIR, 'curated');
export const INGESTED_DIR = path.join(DATA_DIR, 'ingested');
export const PUBLIC_DATA_DIR = path.join(ROOT, 'public', 'data');

const CATEGORY_IDS = new Set([
  'launch',
  'facility',
  'crewed-landing',
  'robotic-landing',
  'rover',
  'impact',
  'artifact',
]);
const ACCURACY = new Set(['surveyed', 'mapped', 'approximate', 'uncertain']);
const STATUS_KINDS = new Set(['success', 'partial', 'failure', 'ongoing', 'unknown']);

export function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`Invalid JSON in ${path.relative(ROOT, file)}: ${err.message}`);
  }
}

export function loadTaxonomy() {
  const taxonomy = readJson(path.join(DATA_DIR, 'taxonomy.json'));
  return taxonomy;
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (entry.isFile() && entry.name.endsWith('.json')) return [full];
    return [];
  });
}

/** Loads every curated site file and flattens it into one array. */
export function loadCuratedSites() {
  const files = walk(CURATED_DIR).sort();
  const records = [];
  for (const file of files) {
    const payload = readJson(file);
    const list = Array.isArray(payload) ? payload : payload.sites;
    if (!Array.isArray(list)) {
      throw new Error(`${path.relative(ROOT, file)} must contain an array or a { "sites": [...] } object`);
    }
    for (const record of list) {
      records.push({ ...record, __file: path.relative(ROOT, file) });
    }
  }
  return records;
}

export function loadIngested() {
  const out = new Map();
  for (const file of walk(INGESTED_DIR)) {
    const payload = readJson(file);
    if (!payload.datasetId) continue;
    out.set(payload.datasetId, payload);
  }
  return out;
}

const DATE_RE = /^\d{4}(-\d{2})?(-\d{2})?$/;
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function validateRecord(record, { bodies, alreadySeen }) {
  const errors = [];
  const warn = [];
  const where = `${record.__file ?? 'dataset'} → ${record.id ?? '(no id)'}`;
  const req = (key) => {
    if (record[key] === undefined || record[key] === null || record[key] === '') {
      errors.push(`${where}: missing required field "${key}"`);
      return false;
    }
    return true;
  };

  ['id', 'body', 'name', 'mission', 'agency', 'category', 'date', 'status', 'summary', 'coordSystem', 'coordAccuracy'].forEach(req);

  if (record.id && !ID_RE.test(record.id)) errors.push(`${where}: id must be kebab-case`);
  if (alreadySeen?.has(record.id)) errors.push(`${where}: duplicate id (also in ${alreadySeen.get(record.id)})`);
  if (record.body && !bodies.has(record.body)) errors.push(`${where}: unknown body "${record.body}"`);
  if (record.category && !CATEGORY_IDS.has(record.category)) {
    errors.push(`${where}: unknown category "${record.category}"`);
  }
  if (record.coordAccuracy && !ACCURACY.has(record.coordAccuracy)) {
    errors.push(`${where}: coordAccuracy must be one of ${[...ACCURACY].join(', ')}`);
  }
  if (record.statusKind && !STATUS_KINDS.has(record.statusKind)) {
    errors.push(`${where}: statusKind must be one of ${[...STATUS_KINDS].join(', ')}`);
  }
  if (record.date && !DATE_RE.test(record.date)) {
    errors.push(`${where}: date "${record.date}" must be YYYY, YYYY-MM or YYYY-MM-DD`);
  }

  if (typeof record.lat !== 'number' || Number.isNaN(record.lat) || Math.abs(record.lat) > 90) {
    errors.push(`${where}: lat must be a number between -90 and 90`);
  }
  if (typeof record.lon !== 'number' || Number.isNaN(record.lon) || Math.abs(record.lon) > 180) {
    errors.push(`${where}: lon must be a number between -180 and 180 (degrees east)`);
  }
  if (!Array.isArray(record.narrative) || record.narrative.length === 0) {
    errors.push(`${where}: narrative must be a non-empty array of paragraphs`);
  } else if (record.narrative.some((p) => typeof p !== 'string' || p.length < 30)) {
    errors.push(`${where}: every narrative paragraph needs at least a sentence`);
  }
  if (!Array.isArray(record.sources) || record.sources.length === 0) {
    errors.push(`${where}: at least one source is required`);
  } else {
    record.sources.forEach((source, i) => {
      if (!source?.title || !source?.url) errors.push(`${where}: sources[${i}] needs title and url`);
      else if (!/^https?:\/\//.test(source.url)) errors.push(`${where}: sources[${i}].url must be absolute`);
    });
  }
  if (record.images) {
    record.images.forEach((img, i) => {
      if (!img?.url || !img?.title || !img?.credit) {
        errors.push(`${where}: images[${i}] needs url, title and credit`);
      }
    });
  }
  if (record.summary && record.summary.length > 320) {
    warn.push(`${where}: summary is longer than 320 characters`);
  }
  if (!record.images || record.images.length === 0) {
    warn.push(`${where}: no historical imagery attached`);
  }
  if (!record.keywords || record.keywords.length === 0) {
    warn.push(`${where}: no keywords (search will only match name/mission text)`);
  }

  return { errors, warn };
}

/** Cross-checks a curated coordinate against the ingested NASA table snapshot. */
export function verifyAgainstIngested(record, ingested, toleranceDeg = 0.02) {
  const check = record.verification;
  if (!check) return null;
  const dataset = ingested.get(check.dataset);
  if (!dataset) {
    return `verification dataset "${check.dataset}" not found for ${record.id}`;
  }
  const match = dataset.records.find((r) => r.match === check.match);
  if (!match) {
    return `verification row "${check.match}" not found in ${check.dataset} (${record.id})`;
  }
  const dLat = Math.abs(match.lat - record.lat);
  const dLonRaw = Math.abs(match.lon - record.lon);
  const dLon = Math.min(dLonRaw, 360 - dLonRaw);
  if (dLat > toleranceDeg || dLon > toleranceDeg) {
    return `coordinate mismatch for ${record.id}: curated ${record.lat}, ${record.lon} vs ${check.dataset} ${match.lat}, ${match.lon}`;
  }
  return null;
}

export function buildDataset() {
  const taxonomy = loadTaxonomy();
  const bodies = new Map(taxonomy.bodies.map((b) => [b.id, b]));
  const sites = loadCuratedSites();
  const ingested = loadIngested();

  const errors = [];
  const warnings = [];
  const seen = new Map();

  for (const record of sites) {
    const result = validateRecord(record, { bodies, alreadySeen: seen });
    errors.push(...result.errors);
    warnings.push(...result.warn);
    if (record.id) seen.set(record.id, record.__file);
    const mismatch = verifyAgainstIngested(record, ingested);
    if (mismatch) errors.push(`${record.__file} → ${mismatch}`);
  }

  // related-id integrity
  const ids = new Set(sites.map((s) => s.id));
  for (const record of sites) {
    for (const rel of record.related ?? []) {
      if (!ids.has(rel)) errors.push(`${record.__file} → ${record.id}: related id "${rel}" does not exist`);
    }
    if (record.verification?.dataset && !ingested.has(record.verification.dataset)) {
      errors.push(`${record.__file} → ${record.id}: unknown verification dataset`);
    }
  }

  // duplicate coordinate guard (same body, same spot, different records are allowed
  // only when intentional — this warns rather than fails).
  const coordKeys = new Map();
  for (const record of sites) {
    const key = `${record.body}:${record.lat.toFixed(4)}:${record.lon.toFixed(4)}`;
    if (coordKeys.has(key)) {
      warnings.push(
        `identical coordinates on ${record.body}: ${coordKeys.get(key)} and ${record.id} — confirm this is intentional`,
      );
    } else {
      coordKeys.set(key, record.id);
    }
  }

  if (errors.length) {
    const list = errors.map((e) => `  ✖ ${e}`).join('\n');
    throw new Error(`Dataset validation failed with ${errors.length} error(s):\n${list}`);
  }

  const clean = sites
    .map(({ __file, ...rest }) => ({
      ...rest,
      body: rest.body,
      date: rest.date,
      statusKind: rest.statusKind ?? 'unknown',
    }))
    .sort((a, b) => (a.body === b.body ? a.date.localeCompare(b.date) : a.body.localeCompare(b.body)));

  const stats = computeStats(clean, taxonomy);
  const version = taxonomy.version;
  const builtAt = new Date().toISOString();

  const dataset = {
    meta: {
      title: taxonomy.title,
      subtitle: taxonomy.subtitle,
      version,
      builtAt,
      recordCount: clean.length,
      license: taxonomy.license,
      methodology:
        'Every record is transcribed from a named NASA or peer-reviewed source. Coordinates are stored as published (degrees east, -180…180) and cross-checked against machine-readable snapshots of the source tables in data/ingested.',
    },
    bodies: taxonomy.bodies,
    categories: taxonomy.categories,
    stats,
    sites: clean,
  };

  return { dataset, stats, warnings, errors };
}

export function computeStats(sites, taxonomy) {
  const byBody = {};
  for (const body of taxonomy.bodies) byBody[body.id] = 0;
  const byCategory = {};
  for (const category of taxonomy.categories) byCategory[category.id] = 0;
  const byAgency = {};
  const byDecade = {};
  let withImages = 0;
  let withVerification = 0;
  const years = [];

  for (const site of sites) {
    byBody[site.body] = (byBody[site.body] ?? 0) + 1;
    byCategory[site.category] = (byCategory[site.category] ?? 0) + 1;
    byAgency[site.agency] = (byAgency[site.agency] ?? 0) + 1;
    const year = Number(site.date.slice(0, 4));
    years.push(year);
    const decade = `${Math.floor(year / 10) * 10}s`;
    byDecade[decade] = (byDecade[decade] ?? 0) + 1;
    if (site.images?.length) withImages += 1;
    if (site.verification) withVerification += 1;
  }

  const sortedSources = new Set();
  for (const site of sites) for (const s of site.sources ?? []) sortedSources.add(s.url);

  return {
    total: sites.length,
    byBody,
    byCategory,
    byAgency,
    byDecade,
    withImages,
    withVerification,
    uniqueSources: sortedSources.size,
    yearRange: years.length ? [Math.min(...years), Math.max(...years)] : [0, 0],
  };
}

export function writeDataset(dataset) {
  fs.mkdirSync(PUBLIC_DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(PUBLIC_DATA_DIR, 'sites.json'), JSON.stringify(dataset, null, 2));
  fs.writeFileSync(
    path.join(PUBLIC_DATA_DIR, 'manifest.json'),
    JSON.stringify(
      {
        version: dataset.meta.version,
        builtAt: dataset.meta.builtAt,
        recordCount: dataset.meta.recordCount,
        stats: dataset.stats,
        bodies: dataset.bodies.map((b) => ({ id: b.id, name: b.name, count: dataset.stats.byBody[b.id] })),
      },
      null,
      2,
    ),
  );
  return PUBLIC_DATA_DIR;
}
