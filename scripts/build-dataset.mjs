#!/usr/bin/env node
/**
 * Builds the runtime dataset consumed by the front end.
 *
 *   data/taxonomy.json + data/curated files  ->  public/data/sites.json
 *
 * The curated files are the single source of truth for stories. Nothing is
 * generated or invented here: this script validates, de-duplicates, cross-checks
 * coordinates against ingested NASA tables and emits statistics.
 */
import { buildDataset, writeDataset } from './lib/dataset.mjs';

const showStats = process.argv.includes('--stats');

try {
  const { dataset, stats, warnings } = buildDataset();
  writeDataset(dataset);

  console.log(`✓ ${stats.total} verified sites → public/data/sites.json`);
  console.log(
    `  bodies: ${Object.entries(stats.byBody)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')}`,
  );
  console.log(
    `  categories: ${Object.entries(stats.byCategory)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')}`,
  );
  console.log(
    `  ${stats.withImages} with imagery · ${stats.withVerification} coordinate-verified · ${stats.uniqueSources} unique source pages`,
  );
  console.log(`  years ${stats.yearRange[0]}–${stats.yearRange[1]}`);
  if (warnings.length) {
    console.log(`\n  ${warnings.length} warning(s):`);
    for (const warning of warnings) console.log(`   ⚠ ${warning}`);
  }
  if (showStats) {
    console.log('\n  by agency:', stats.byAgency);
    console.log('  by decade:', stats.byDecade);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
