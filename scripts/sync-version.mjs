// Copies the package.json version into src/manifest.json.
// Runs automatically on `npm version <patch|minor|major>`.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(root, 'src', 'manifest.json');

const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

if (manifest.version !== version) {
  manifest.version = version;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`src/manifest.json version set to ${version}`);
}
