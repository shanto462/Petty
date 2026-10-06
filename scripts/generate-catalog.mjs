// Regenerates src/shared/catalog.js. Use `--check` in CI to fail when it is stale.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CATALOG_FILE, ROOT, generateCatalogSource } from './lib/catalog.mjs';

const check = process.argv.includes('--check');
const next = await generateCatalogSource();
const current = await readFile(CATALOG_FILE, 'utf8').catch(() => '');
const relative = path.relative(ROOT, CATALOG_FILE);

if (current === next) {
  console.log(`${relative} is up to date.`);
} else if (check) {
  console.error(`${relative} is out of date. Run \`npm run generate\` and commit the result.`);
  process.exit(1);
} else {
  await writeFile(CATALOG_FILE, next);
  console.log(`Wrote ${relative}.`);
}
