#!/usr/bin/env node
/**
 * Refresh every source snapshot used by the build.
 *
 *   npm run ingest             # fetch each publisher page
 *   npm run ingest -- --from=data/raw   # parse HTML you saved yourself
 *   npm run ingest -- --check  # parse only, write nothing
 *
 * The build (`npm run data:build`) never needs the network: it reads the
 * committed snapshots in `data/ingested/`. Re-running this script is how those
 * snapshots are refreshed, and any record whose coordinate cannot be parsed is
 * reported instead of guessed.
 */
import { spawn } from 'node:child_process';

const passthrough = process.argv.slice(2);
const steps = [
  ['scripts/ingest/nssdca-moon.mjs', 'NSSDCA lunar sites + lunar artefacts'],
  ['scripts/ingest/giss-mars24.mjs', 'GISS Mars24 lander catalogue'],
];

let failures = 0;
for (const [script, label] of steps) {
  console.log(`\n── ${label}`);
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...passthrough], { stdio: 'inherit' });
    child.on('exit', (value) => resolve(value ?? 1));
  });
  if (code !== 0) failures += 1;
}

if (failures) {
  console.error(`\n✗ ${failures} source${failures > 1 ? 's' : ''} could not be refreshed — committed snapshots were left in place.`);
  process.exit(1);
}
console.log('\n✓ snapshots refreshed. Run `npm run data:build` to rebuild the runtime dataset.');
