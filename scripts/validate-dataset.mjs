#!/usr/bin/env node
/** Validates curated data without writing the public dataset (used in CI). */
import { buildDataset } from './lib/dataset.mjs';

try {
  const { stats, warnings } = buildDataset();
  console.log(`✓ ${stats.total} records valid`);
  for (const warning of warnings) console.log(`  ⚠ ${warning}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
