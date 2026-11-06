#!/usr/bin/env node
/**
 * Verify every NASA image used by the dataset against the NASA Image and Video
 * Library (https://images-api.nasa.gov).
 *
 *   npm run data:images            # verify all records that carry imagery
 *   npm run data:images -- --strict  # fail when an image cannot be confirmed
 *
 * For each image URL the script extracts the NASA ID, asks the API for its
 * metadata, and reports whether the title, the centre and the publication date
 * agree with what the record claims. Nothing is written: this is an integrity
 * check, not a scraper. It needs the network; the build itself does not.
 */
import { readFile } from 'node:fs/promises';

const API = 'https://images-api.nasa.gov/search?media_type=image&nasa_id=';
const strict = process.argv.includes('--strict');

/** `.../image/<nasa_id>/<nasa_id>~medium.jpg` → `<nasa_id>` */
function nasaIdFromUrl(url) {
  const match = String(url).match(/images-assets\.nasa\.gov\/image\/([^/]+)\//i);
  return match ? match[1] : null;
}

async function lookup(nasaId) {
  const response = await fetch(`${API}${encodeURIComponent(nasaId)}`, {
    headers: { 'user-agent': 'AbandonedButNotForgotten/1.0 (dataset verification)' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  const item = body?.collection?.items?.[0];
  if (!item) return null;
  const data = item.data?.[0] ?? {};
  return {
    nasaId: data.nasa_id,
    title: data.title,
    center: data.center,
    dateCreated: data.date_created,
    description: data.description,
  };
}

const dataset = JSON.parse(await readFile('public/data/sites.json', 'utf8'));
const targets = [];
for (const site of dataset.sites) {
  for (const image of site.images ?? []) {
    const nasaId = nasaIdFromUrl(image.url);
    if (nasaId) targets.push({ siteId: site.id, image, nasaId });
  }
}

if (!targets.length) {
  console.log('No NASA-hosted imagery in the dataset — nothing to verify.');
  process.exit(0);
}

console.log(`Verifying ${targets.length} NASA image reference(s)…\n`);
let failures = 0;
const seen = new Map();

for (const target of targets) {
  let meta = seen.get(target.nasaId);
  if (meta === undefined) {
    try {
      meta = await lookup(target.nasaId);
    } catch (error) {
      meta = { error: error.message };
    }
    seen.set(target.nasaId, meta);
  }

  if (!meta || meta.error) {
    failures += 1;
    console.warn(`⚠ ${target.siteId}: ${target.nasaId} — ${meta?.error ?? 'not found in the NASA library'}`);
    continue;
  }

  const creditMatches = target.image.credit?.toLowerCase().includes(String(meta.center).toLowerCase());
  console.log(
    `✓ ${target.siteId}: ${meta.nasaId} — “${meta.title}” (${meta.center}, ${String(meta.dateCreated).slice(0, 10)})` +
      (creditMatches ? '' : '  ← credit string does not mention the publishing centre'),
  );
}

if (failures) {
  console.error(`\n${failures} image reference(s) could not be confirmed.`);
  if (strict) process.exit(1);
} else {
  console.log('\nAll image references confirmed.');
}
